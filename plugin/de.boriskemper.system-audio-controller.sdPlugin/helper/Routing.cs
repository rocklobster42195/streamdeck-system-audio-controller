// Which output device an app plays on (Windows' "App volume and device preferences"), read and set
// per process. Through Windows' internal AudioPolicyConfig (WinRT activation factory, as EarTrumpet
// does): undocumented, with one interface id up to Windows 10 21H1 and another since. Windows keeps
// a choice for the app itself (also after a restart). Checked 2026-10-09 on build 26200: set, read
// back and reset on Teams.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

namespace SacAudio
{
    [Guid("ab3d4648-e242-459f-b02f-541c70306324"), InterfaceType(ComInterfaceType.InterfaceIsIInspectable)]
    interface IAudioPolicyConfigFactory
    {
        int _1(); int _2(); int _3(); int _4(); int _5(); int _6(); int _7(); int _8(); int _9(); int _10();
        int _11(); int _12(); int _13(); int _14(); int _15(); int _16(); int _17(); int _18(); int _19();
        [PreserveSig] int SetPersistedDefaultAudioEndpoint(uint processId, int flow, int role, IntPtr deviceId);
        [PreserveSig] int GetPersistedDefaultAudioEndpoint(uint processId, int flow, int role, [MarshalAs(UnmanagedType.HString)] out string deviceId);
    }

    /** The same before Windows 10 21H2 (build 21390), under another id. */
    [Guid("2a59116d-6c4f-45e0-a74f-707e3fef9258"), InterfaceType(ComInterfaceType.InterfaceIsIInspectable)]
    interface IAudioPolicyConfigFactoryDownlevel
    {
        int _1(); int _2(); int _3(); int _4(); int _5(); int _6(); int _7(); int _8(); int _9(); int _10();
        int _11(); int _12(); int _13(); int _14(); int _15(); int _16(); int _17(); int _18(); int _19();
        [PreserveSig] int SetPersistedDefaultAudioEndpoint(uint processId, int flow, int role, IntPtr deviceId);
        [PreserveSig] int GetPersistedDefaultAudioEndpoint(uint processId, int flow, int role, [MarshalAs(UnmanagedType.HString)] out string deviceId);
    }

    static class Routing
    {
        const int eRender = 0, eConsole = 0, eMultimedia = 1;
        /** How Windows names an output device here: the endpoint id inside a device interface path. */
        const string PREFIX = @"\\?\SWD#MMDEVAPI#", RENDER_INTERFACE = "#{e6327cad-dcec-4949-ae8a-991e976a79d2}";

        [DllImport("combase.dll", PreserveSig = false)]
        static extern void WindowsCreateString([MarshalAs(UnmanagedType.LPWStr)] string s, int length, out IntPtr hstring);

        [DllImport("combase.dll", PreserveSig = false)]
        static extern void WindowsDeleteString(IntPtr hstring);

        [DllImport("combase.dll", PreserveSig = false)]
        static extern void RoGetActivationFactory(IntPtr classId, [In] ref Guid iid, [MarshalAs(UnmanagedType.IInspectable)] out object factory);

        static IAudioPolicyConfigFactory current;
        static IAudioPolicyConfigFactoryDownlevel downlevel;
        static bool tried;

        /** Whether this Windows lets apps be routed (false: the App output key says so). */
        public static bool Available
        {
            get
            {
                Init();
                return current != null || downlevel != null;
            }
        }

        static void Init()
        {
            if (tried) return;
            tried = true;
            const string name = "Windows.Media.Internal.AudioPolicyConfig";
            IntPtr cls;
            WindowsCreateString(name, name.Length, out cls);
            try
            {
                object f;
                var iid = typeof(IAudioPolicyConfigFactory).GUID;
                try
                {
                    RoGetActivationFactory(cls, ref iid, out f);
                    current = (IAudioPolicyConfigFactory)f;
                }
                catch
                {
                    iid = typeof(IAudioPolicyConfigFactoryDownlevel).GUID;
                    try
                    {
                        RoGetActivationFactory(cls, ref iid, out f);
                        downlevel = (IAudioPolicyConfigFactoryDownlevel)f;
                    }
                    catch
                    {
                        // neither: routing isn't possible here
                    }
                }
            }
            finally
            {
                WindowsDeleteString(cls);
            }
        }

        /** The device the process is routed to ("{0.0.0.00000000}.{…}"), "" for Windows' default, null when unknown. */
        public static string Get(uint pid)
        {
            Init();
            string path = null;
            int hr = current != null ? current.GetPersistedDefaultAudioEndpoint(pid, eRender, eMultimedia, out path)
                : downlevel != null ? downlevel.GetPersistedDefaultAudioEndpoint(pid, eRender, eMultimedia, out path) : -1;
            if (hr != 0) return null;
            if (string.IsNullOrEmpty(path)) return "";
            var m = Regex.Match(path, @"\{0\.0\.0\.[0-9a-f]+\}\.\{[0-9a-f-]+\}", RegexOptions.IgnoreCase);
            return m.Success ? m.Value : "";
        }

        /** Routes the processes to a device ("" or null: back to Windows' default). */
        public static void Set(IEnumerable<uint> pids, string device)
        {
            Init();
            if (current == null && downlevel == null) throw new Exception("this Windows can't route apps");
            var h = IntPtr.Zero;
            if (!string.IsNullOrEmpty(device))
            {
                var full = PREFIX + device + RENDER_INTERFACE;
                WindowsCreateString(full, full.Length, out h);
            }
            try
            {
                foreach (var pid in pids)
                {
                    foreach (var role in new[] { eConsole, eMultimedia })
                    {
                        var hr = current != null ? current.SetPersistedDefaultAudioEndpoint(pid, eRender, role, h) : downlevel.SetPersistedDefaultAudioEndpoint(pid, eRender, role, h);
                        if (hr != 0) throw new Exception("routing refused (0x" + hr.ToString("x8") + ")");
                    }
                }
            }
            finally
            {
                if (h != IntPtr.Zero) WindowsDeleteString(h);
            }
        }
    }
}
