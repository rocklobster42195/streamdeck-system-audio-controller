// SA-C's audio helper: the default output and input devices (volume, mute, level), the list of
// output devices (and switching the default), and the apps playing sound (volume, mute, level per
// app). Compiled by sac-audio.ps1 at start (Add-Type), talks JSON lines over stdin/stdout.
//
// Out (one JSON object per line; "flow" is "out" or "in"):
//   {"t":"ready"}
//   {"t":"device","flow":"out","id":"…","name":"Speakers (Realtek)"}   default device (again on change)
//   {"t":"volume","flow":"out","v":0.42,"muted":false}                  on start and on every change
//   {"t":"meter","flow":"out","l":-23.5,"r":-24.1}                      peak dBFS, ~20/s, while metering is on
//   {"t":"devices","list":[{"id":"…","name":"…","default":true}]}       active output devices, on change
//   {"t":"apps","list":[{"app":"spotify","name":"Spotify","v":1,"muted":false,"active":true}]}   on change
//   {"t":"appmeter","app":"spotify","l":-20.1,"r":-21.0}                ~20/s for the apps asked for
//   {"t":"appicon","app":"spotify","png":"<base64>","grey":"<base64>"}    once per app: its icon, 128×128, and greyed
//   {"t":"error","message":"…"}
// In:
//   {"cmd":"volume","flow":"out","v":0.5}   {"cmd":"mute","flow":"in","on":true}   {"cmd":"meters","flow":"out","on":true}
//   {"cmd":"default","id":"…"}   {"cmd":"appvolume","app":"spotify","v":0.8}   {"cmd":"appmute","app":"spotify","on":true}
//   {"cmd":"appmeters","apps":"spotify,firefox"}   {"cmd":"quit"}
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace SacAudio
{
    /** The default device of one direction: volume, mute and its level. */
    class Endpoint
    {
        public readonly int Flow;
        public readonly string Tag;
        public IAudioEndpointVolume Volume;
        public IAudioMeterInformation Meter;
        public IAudioSessionManager2 Sessions;
        public string Id = "";
        public bool Metering;
        float lastVolume = -1;
        bool lastMuted;

        public Endpoint(int flow, string tag)
        {
            Flow = flow;
            Tag = tag;
        }

        /** Re-open volume and meter when the default device changed (or at start). */
        public void Check(IMMDeviceEnumerator enumerator)
        {
            IMMDevice device;
            if (enumerator.GetDefaultAudioEndpoint(Flow, 0, out device) != 0 || device == null)
            {
                if (Id != "") Helper.Emit("{\"t\":\"device\",\"flow\":\"" + Tag + "\",\"id\":\"\",\"name\":\"\"}");
                Id = "";
                Volume = null;
                Meter = null;
                Sessions = null;
                return;
            }
            string id;
            device.GetId(out id);
            if (id == Id) return;
            Id = id;
            Volume = (IAudioEndpointVolume)Helper.Activate(device, Helper.IID_Volume);
            Meter = (IAudioMeterInformation)Helper.Activate(device, Helper.IID_Meter);
            Sessions = Flow == 0 ? (IAudioSessionManager2)Helper.Activate(device, Helper.IID_Sessions) : null;
            Helper.Emit("{\"t\":\"device\",\"flow\":\"" + Tag + "\",\"id\":" + Helper.Quote(id) + ",\"name\":" + Helper.Quote(Helper.Name(device)) + "}");
            lastVolume = -1;
        }

        public void PollVolume()
        {
            if (Volume == null) return;
            float v;
            bool muted;
            if (Volume.GetMasterVolumeLevelScalar(out v) != 0 || Volume.GetMute(out muted) != 0) return;
            if (Math.Abs(v - lastVolume) < 0.0005 && muted == lastMuted) return;
            lastVolume = v;
            lastMuted = muted;
            Helper.Emit("{\"t\":\"volume\",\"flow\":\"" + Tag + "\",\"v\":" + Helper.Num(v) + ",\"muted\":" + Helper.Bool(muted) + "}");
        }

        public void PollMeter()
        {
            if (!Metering || Meter == null) return;
            var lr = Helper.Peaks(Meter);
            if (lr != null) Helper.Emit("{\"t\":\"meter\",\"flow\":\"" + Tag + "\",\"l\":" + lr[0] + ",\"r\":" + lr[1] + "}");
        }
    }

    /** An app with sound: all its sessions on the default output (Firefox has several). */
    class App
    {
        public string Key;
        public string Name;
        public readonly List<ISimpleAudioVolume> Volumes = new List<ISimpleAudioVolume>();
        public readonly List<IAudioMeterInformation> Meters = new List<IAudioMeterInformation>();
        public bool Active;
    }

    public static class Helper
    {
        const int eRender = 0, eCapture = 1, CLSCTX_ALL = 23, DEVICE_STATE_ACTIVE = 1;
        const int TICK_MS = 50, DEVICE_CHECK_MS = 1000, APPS_MS = 500;
        internal static readonly Guid IID_Volume = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
        internal static readonly Guid IID_Meter = new Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064");
        internal static readonly Guid IID_Sessions = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
        static PropertyKey FriendlyName = new PropertyKey { fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 };

        static readonly ConcurrentQueue<string> commands = new ConcurrentQueue<string>();
        static volatile bool inputClosed;
        static IMMDeviceEnumerator enumerator;
        static readonly Endpoint output = new Endpoint(eRender, "out");
        static readonly Endpoint input = new Endpoint(eCapture, "in");
        static Dictionary<string, App> apps = new Dictionary<string, App>();
        static readonly Dictionary<uint, string[]> processNames = new Dictionary<uint, string[]>();
        /** Apps whose icon went out already (once per helper run). */
        static readonly HashSet<string> iconsSent = new HashSet<string>();
        static HashSet<string> meteredApps = new HashSet<string>();
        static string lastDevices = "";
        static string lastApps = "";

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
            CheckDevices();
            PollApps();
            int sinceDevices = 0, sinceApps = 0;
            while (!inputClosed)
            {
                string cmd;
                while (commands.TryDequeue(out cmd))
                {
                    if (!Handle(cmd)) return;
                }
                sinceDevices += TICK_MS;
                sinceApps += TICK_MS;
                if (sinceDevices >= DEVICE_CHECK_MS)
                {
                    sinceDevices = 0;
                    CheckDevices();
                }
                if (sinceApps >= APPS_MS)
                {
                    sinceApps = 0;
                    PollApps();
                }
                Safe(output.PollVolume);
                Safe(input.PollVolume);
                Safe(output.PollMeter);
                Safe(input.PollMeter);
                Safe(PollAppMeters);
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
                var ep = Field(json, "flow") == "in" ? input : output;
                var ctx = Guid.Empty;
                switch (cmd)
                {
                    case "volume":
                        if (ep.Volume != null) ep.Volume.SetMasterVolumeLevelScalar(Level(Field(json, "v")), ref ctx);
                        break;
                    case "mute":
                        if (ep.Volume != null) ep.Volume.SetMute(Field(json, "on") == "true", ref ctx);
                        break;
                    case "meters":
                        ep.Metering = Field(json, "on") == "true";
                        break;
                    case "default":
                        var policy = (IPolicyConfig)new PolicyConfigComObject();
                        var id = Field(json, "id");
                        for (var role = 0; role < 3; role++) policy.SetDefaultEndpoint(id, role);
                        CheckDevices();
                        break;
                    case "appvolume":
                    case "appmute":
                        App app;
                        if (!apps.TryGetValue(Field(json, "app"), out app)) break;
                        foreach (var v in app.Volumes)
                        {
                            if (cmd == "appvolume") v.SetMasterVolume(Level(Field(json, "v")), ref ctx);
                            else v.SetMute(Field(json, "on") == "true", ref ctx);
                        }
                        PollApps();
                        break;
                    case "appmeters":
                        meteredApps = new HashSet<string>(Field(json, "apps").Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries));
                        break;
                }
            }
            catch (Exception e)
            {
                Error("command failed: " + e.Message);
            }
            return true;
        }

        static void CheckDevices()
        {
            Safe(() => output.Check(enumerator));
            Safe(() => input.Check(enumerator));
            Safe(ListDevices);
        }

        /** The active output devices, for the Device key. */
        static void ListDevices()
        {
            IMMDeviceCollection all;
            if (enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, out all) != 0) return;
            int count;
            all.GetCount(out count);
            var items = new List<string>();
            for (var i = 0; i < count; i++)
            {
                IMMDevice device;
                all.Item(i, out device);
                string id;
                device.GetId(out id);
                items.Add("{\"id\":" + Quote(id) + ",\"name\":" + Quote(Name(device)) + ",\"default\":" + Bool(id == output.Id) + "}");
            }
            var json = "{\"t\":\"devices\",\"list\":[" + string.Join(",", items) + "]}";
            if (json == lastDevices) return;
            lastDevices = json;
            Emit(json);
        }

        /** The apps with sound on the default output; sends the list when anything changed. */
        static void PollApps()
        {
            var found = new Dictionary<string, App>();
            try
            {
                IAudioSessionEnumerator sessions;
                if (output.Sessions != null && output.Sessions.GetSessionEnumerator(out sessions) == 0)
                {
                    int count;
                    sessions.GetCount(out count);
                    for (var i = 0; i < count; i++)
                    {
                        IAudioSessionControl2 session;
                        if (sessions.GetSession(i, out session) != 0) continue;
                        int state;
                        session.GetState(out state);
                        if (state == 2) continue; // expired
                        var who = Who(session);
                        App app;
                        if (!found.TryGetValue(who[0], out app)) found[who[0]] = app = new App { Key = who[0], Name = who[1] };
                        app.Volumes.Add((ISimpleAudioVolume)session);
                        app.Meters.Add((IAudioMeterInformation)session);
                        if (state == 1) app.Active = true;
                    }
                }
            }
            catch (Exception e)
            {
                Error("apps: " + e.Message);
            }
            apps = found;
            var items = found.Values.OrderBy(a => a.Name, StringComparer.CurrentCultureIgnoreCase).Select(a =>
            {
                float v = 1;
                bool muted = true;
                foreach (var s in a.Volumes)
                {
                    bool m;
                    s.GetMute(out m);
                    muted &= m;
                }
                a.Volumes[0].GetMasterVolume(out v);
                return "{\"app\":" + Quote(a.Key) + ",\"name\":" + Quote(a.Name) + ",\"v\":" + Num(v) + ",\"muted\":" + Bool(muted) + ",\"active\":" + Bool(a.Active) + "}";
            });
            var json = "{\"t\":\"apps\",\"list\":[" + string.Join(",", items) + "]}";
            if (json == lastApps) return;
            lastApps = json;
            Emit(json);
        }

        static void PollAppMeters()
        {
            foreach (var key in meteredApps)
            {
                App app;
                if (!apps.TryGetValue(key, out app)) continue;
                // The loudest of the app's sessions
                float l = 0, r = 0;
                foreach (var m in app.Meters)
                {
                    var peaks = RawPeaks(m);
                    if (peaks == null) continue;
                    l = Math.Max(l, peaks[0]);
                    r = Math.Max(r, peaks.Length > 1 ? peaks[1] : peaks[0]);
                }
                Emit("{\"t\":\"appmeter\",\"app\":" + Quote(key) + ",\"l\":" + Db(l) + ",\"r\":" + Db(r) + "}");
            }
        }

        /** An app's key (process name, e.g. "spotify") and name (its description, e.g. "Spotify"). */
        static string[] Who(IAudioSessionControl2 session)
        {
            if (session.IsSystemSoundsSession() == 0) return new[] { "system", "System sounds" };
            uint pid;
            session.GetProcessId(out pid);
            string[] cached;
            if (processNames.TryGetValue(pid, out cached)) return cached;
            var who = new[] { "pid" + pid, "Process " + pid };
            try
            {
                var p = Process.GetProcessById((int)pid);
                who[0] = p.ProcessName.ToLowerInvariant();
                who[1] = p.ProcessName;
                var description = p.MainModule.FileVersionInfo.FileDescription;
                if (!string.IsNullOrWhiteSpace(description)) who[1] = description.Trim();
                if (iconsSent.Add(who[0]))
                {
                    var png = Icons.Png(p.MainModule.FileName);
                    if (png != null) Emit("{\"t\":\"appicon\",\"app\":" + Quote(who[0]) + ",\"png\":\"" + png[0] + "\",\"grey\":\"" + png[1] + "\"}");
                }
            }
            catch
            {
                // gone, or not ours to inspect (another user, elevated): keep what we have
            }
            processNames[pid] = who;
            return who;
        }

        internal static object Activate(IMMDevice device, Guid iid)
        {
            object iface;
            device.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out iface);
            return iface;
        }

        internal static string Name(IMMDevice device)
        {
            IPropertyStore store;
            if (device.OpenPropertyStore(0, out store) != 0) return "";
            PropVariant value;
            store.GetValue(ref FriendlyName, out value);
            return value.vt == 31 ? Marshal.PtrToStringUni(value.p) : "";
        }

        static float[] RawPeaks(IAudioMeterInformation meter)
        {
            uint count;
            if (meter.GetMeteringChannelCount(out count) != 0 || count == 0) return null;
            var peaks = new float[count];
            return meter.GetChannelsPeakValues(count, peaks) == 0 ? peaks : null;
        }

        /** Left and right peak as dBFS strings. */
        internal static string[] Peaks(IAudioMeterInformation meter)
        {
            var peaks = RawPeaks(meter);
            if (peaks == null) return null;
            return new[] { Db(peaks[0]), Db(peaks.Length > 1 ? peaks[1] : peaks[0]) };
        }

        /** Amplitude 0..1 → dBFS, floor -90. */
        static string Db(float amplitude)
        {
            var db = amplitude > 0.0000316f ? 20 * Math.Log10(amplitude) : -90;
            return Math.Round(db, 1).ToString("0.0", CultureInfo.InvariantCulture);
        }

        static float Level(string s)
        {
            return Math.Max(0f, Math.Min(1f, float.Parse(s, CultureInfo.InvariantCulture)));
        }

        internal static string Num(float v)
        {
            return v.ToString("0.###", CultureInfo.InvariantCulture);
        }

        internal static string Bool(bool b)
        {
            return b ? "true" : "false";
        }

        static void Safe(Action step)
        {
            try
            {
                step();
            }
            catch (Exception e)
            {
                Error(e.Message);
            }
        }

        internal static void Emit(string line)
        {
            Console.Out.Write(line + "\n");
            Console.Out.Flush();
        }

        static void Error(string message)
        {
            Emit("{\"t\":\"error\",\"message\":" + Quote(message) + "}");
        }

        internal static string Quote(string s)
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
            return !m.Success ? "" : m.Groups["s"].Success ? Regex.Unescape(m.Groups["s"].Value) : m.Groups["v"].Value;
        }
    }
}
