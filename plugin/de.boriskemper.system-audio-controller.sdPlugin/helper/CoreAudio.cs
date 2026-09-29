// SA-C's audio helper: the default output device's volume, mute and level through Windows Core
// Audio. Compiled by sac-audio.ps1 at start (Add-Type), talks JSON lines over stdin/stdout.
//
// Out (one JSON object per line):
//   {"t":"ready"}
//   {"t":"device","id":"…","name":"Speakers (Realtek)"}     default output device (again on change)
//   {"t":"volume","v":0.42,"muted":false}                    on start and on every change
//   {"t":"meter","l":-23.5,"r":-24.1}                        peak dBFS, ~20/s, only while metering is on
//   {"t":"error","message":"…"}
// In:
//   {"cmd":"volume","v":0.5}   {"cmd":"mute","on":true}   {"cmd":"meters","on":true}   {"cmd":"quit"}
using System;
using System.Collections.Concurrent;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace SacAudio
{
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    class MMDeviceEnumeratorComObject { }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
        int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
        int RegisterEndpointNotificationCallback(IntPtr client);
        int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
        int OpenPropertyStore(int access, out IPropertyStore properties);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetState(out int state);
    }

    [StructLayout(LayoutKind.Sequential)]
    struct PropertyKey
    {
        public Guid fmtid;
        public int pid;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct PropVariant
    {
        public ushort vt;
        public ushort r1, r2, r3;
        public IntPtr p;
        public IntPtr p2;
    }

    [Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPropertyStore
    {
        int GetCount(out int count);
        int GetAt(int index, out PropertyKey key);
        int GetValue(ref PropertyKey key, out PropVariant value);
        int SetValue(ref PropertyKey key, ref PropVariant value);
        int Commit();
    }

    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioEndpointVolume
    {
        int RegisterControlChangeNotify(IntPtr notify);
        int UnregisterControlChangeNotify(IntPtr notify);
        int GetChannelCount(out uint count);
        int SetMasterVolumeLevel(float db, ref Guid context);
        int SetMasterVolumeLevelScalar(float level, ref Guid context);
        int GetMasterVolumeLevel(out float db);
        int GetMasterVolumeLevelScalar(out float level);
        int SetChannelVolumeLevel(uint channel, float db, ref Guid context);
        int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
        int GetChannelVolumeLevel(uint channel, out float db);
        int GetChannelVolumeLevelScalar(uint channel, out float level);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
        int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
    }

    [Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioMeterInformation
    {
        int GetPeakValue(out float peak);
        int GetMeteringChannelCount(out uint count);
        int GetChannelsPeakValues(uint count, [Out, MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 0)] float[] peaks);
        int QueryHardwareSupport(out uint mask);
    }

    public static class Helper
    {
        const int eRender = 0, eConsole = 0, CLSCTX_ALL = 23;
        const int TICK_MS = 50, DEVICE_CHECK_MS = 1000;
        static readonly Guid IID_Volume = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
        static readonly Guid IID_Meter = new Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064");
        static PropertyKey FriendlyName = new PropertyKey { fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 };

        static readonly ConcurrentQueue<string> commands = new ConcurrentQueue<string>();
        static volatile bool inputClosed;
        static IMMDeviceEnumerator enumerator;
        static IAudioEndpointVolume volume;
        static IAudioMeterInformation meter;
        static string deviceId = "";
        static float lastVolume = -1;
        static bool lastMuted;
        static bool metering;

        public static void Run()
        {
            Console.OutputEncoding = new UTF8Encoding(false);
            Console.InputEncoding = new UTF8Encoding(false);
            var reader = new Thread(() =>
            {
                string line;
                while ((line = Console.In.ReadLine()) != null) commands.Enqueue(line);
                inputClosed = true;
            });
            reader.IsBackground = true;
            reader.Start();

            enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
            Emit("{\"t\":\"ready\"}");
            CheckDevice();
            var sinceDeviceCheck = 0;
            while (!inputClosed)
            {
                string cmd;
                while (commands.TryDequeue(out cmd))
                {
                    if (!Handle(cmd)) return;
                }
                sinceDeviceCheck += TICK_MS;
                if (sinceDeviceCheck >= DEVICE_CHECK_MS)
                {
                    sinceDeviceCheck = 0;
                    CheckDevice();
                }
                PollVolume();
                if (metering) PollMeter();
                Thread.Sleep(TICK_MS);
            }
        }

        /** Handles one command; false = quit. */
        static bool Handle(string json)
        {
            try
            {
                var cmd = Field(json, "cmd");
                if (cmd == "quit") return false;
                var ctx = Guid.Empty;
                if (cmd == "volume" && volume != null)
                {
                    var v = Math.Max(0f, Math.Min(1f, float.Parse(Field(json, "v"), CultureInfo.InvariantCulture)));
                    volume.SetMasterVolumeLevelScalar(v, ref ctx);
                }
                else if (cmd == "mute" && volume != null) volume.SetMute(Field(json, "on") == "true", ref ctx);
                else if (cmd == "meters") metering = Field(json, "on") == "true";
            }
            catch (Exception e)
            {
                Error("command failed: " + e.Message);
            }
            return true;
        }

        /** The default output device; on a change (or at start) re-open volume and meter. */
        static void CheckDevice()
        {
            try
            {
                IMMDevice device;
                if (enumerator.GetDefaultAudioEndpoint(eRender, eConsole, out device) != 0 || device == null)
                {
                    if (deviceId != "") Emit("{\"t\":\"device\",\"id\":\"\",\"name\":\"\"}");
                    deviceId = "";
                    volume = null;
                    meter = null;
                    return;
                }
                string id;
                device.GetId(out id);
                if (id == deviceId) return;
                deviceId = id;
                object iface;
                var iid = IID_Volume;
                device.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out iface);
                volume = (IAudioEndpointVolume)iface;
                iid = IID_Meter;
                device.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out iface);
                meter = (IAudioMeterInformation)iface;
                Emit("{\"t\":\"device\",\"id\":" + Quote(id) + ",\"name\":" + Quote(Name(device)) + "}");
                lastVolume = -1;
            }
            catch (Exception e)
            {
                Error("device: " + e.Message);
            }
        }

        static string Name(IMMDevice device)
        {
            IPropertyStore store;
            if (device.OpenPropertyStore(0, out store) != 0) return "";
            PropVariant value;
            store.GetValue(ref FriendlyName, out value);
            return value.vt == 31 ? Marshal.PtrToStringUni(value.p) : "";
        }

        static void PollVolume()
        {
            if (volume == null) return;
            float v;
            bool muted;
            if (volume.GetMasterVolumeLevelScalar(out v) != 0 || volume.GetMute(out muted) != 0) return;
            if (Math.Abs(v - lastVolume) < 0.0005 && muted == lastMuted) return;
            lastVolume = v;
            lastMuted = muted;
            Emit("{\"t\":\"volume\",\"v\":" + v.ToString("0.###", CultureInfo.InvariantCulture) + ",\"muted\":" + (muted ? "true" : "false") + "}");
        }

        static void PollMeter()
        {
            if (meter == null) return;
            uint count;
            if (meter.GetMeteringChannelCount(out count) != 0 || count == 0) return;
            var peaks = new float[count];
            if (meter.GetChannelsPeakValues(count, peaks) != 0) return;
            var r = count > 1 ? peaks[1] : peaks[0];
            Emit("{\"t\":\"meter\",\"l\":" + Db(peaks[0]) + ",\"r\":" + Db(r) + "}");
        }

        /** Amplitude 0..1 → dBFS, floor -90. */
        static string Db(float amplitude)
        {
            var db = amplitude > 0.0000316f ? 20 * Math.Log10(amplitude) : -90;
            return Math.Round(db, 1).ToString("0.0", CultureInfo.InvariantCulture);
        }

        static void Emit(string line)
        {
            Console.Out.Write(line + "\n");
            Console.Out.Flush();
        }

        static void Error(string message)
        {
            Emit("{\"t\":\"error\",\"message\":" + Quote(message) + "}");
        }

        static string Quote(string s)
        {
            var sb = new StringBuilder("\"");
            foreach (var c in s ?? "")
            {
                if (c == '"' || c == '\\') sb.Append('\\').Append(c);
                else if (c < ' ') sb.Append("\\u").Append(((int)c).ToString("x4"));
                else sb.Append(c);
            }
            return sb.Append('"').ToString();
        }

        /** A top-level string, number or boolean field of a flat JSON object (enough for our commands). */
        static string Field(string json, string name)
        {
            var m = Regex.Match(json, "\"" + name + "\"\\s*:\\s*(\"(?<s>[^\"]*)\"|(?<v>[^,}\\s]+))");
            return !m.Success ? "" : m.Groups["s"].Success ? m.Groups["s"].Value : m.Groups["v"].Value;
        }
    }
}
