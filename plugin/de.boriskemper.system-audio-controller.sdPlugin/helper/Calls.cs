// Calls and the mic: which apps are in a call (Windows' ducking notification: a communications
// stream opened, e.g. Teams, Discord, Zoom; it names the app, ~3 s before the mic opens) and which
// apps use the mic now (the default input's active sessions). Checked 2026-10-05 with a Teams test
// call: both signals, duck 11:49:10.7 → mic 11:49:13.6 → mic free 11:49:27.8 → unduck 11:49:28.2.
//
// Out (on change):
//   {"t":"calls","list":[{"app":"ms-teams","name":"Microsoft Teams"}]}
//   {"t":"micusers","list":[{"app":"ms-teams","name":"Microsoft Teams"}]}
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

namespace SacAudio
{
    [Guid("C3B284D4-6D39-4359-B3CF-B56DDB3BB39C"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown), ComVisible(true)]
    public interface IAudioVolumeDuckNotification
    {
        [PreserveSig] int OnVolumeDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string sessionId, uint communicationSessions);
        [PreserveSig] int OnVolumeUnduckNotification([MarshalAs(UnmanagedType.LPWStr)] string sessionId);
    }

    /** Called by Windows on its own threads; only queues, the helper's loop does the rest. */
    [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
    public class DuckSink : IAudioVolumeDuckNotification
    {
        internal readonly ConcurrentQueue<KeyValuePair<string, bool>> Events = new ConcurrentQueue<KeyValuePair<string, bool>>();

        public int OnVolumeDuckNotification(string sessionId, uint communicationSessions)
        {
            Events.Enqueue(new KeyValuePair<string, bool>(sessionId ?? "", true));
            return 0;
        }

        public int OnVolumeUnduckNotification(string sessionId)
        {
            Events.Enqueue(new KeyValuePair<string, bool>(sessionId ?? "", false));
            return 0;
        }
    }

    static class Calls
    {
        static readonly DuckSink sink = new DuckSink();
        static IntPtr sinkPtr = IntPtr.Zero;
        static IAudioSessionManager2 watched;
        /** Communications sessions that duck right now → their app [key, name]. */
        static readonly Dictionary<string, string[]> calls = new Dictionary<string, string[]>();
        static string lastCalls = "", lastMic = "";

        /** Follows the default output's session manager (again after a device change). */
        public static void Watch(IAudioSessionManager2 manager)
        {
            if (ReferenceEquals(manager, watched)) return;
            if (watched != null && sinkPtr != IntPtr.Zero) watched.UnregisterDuckNotification(sinkPtr);
            watched = manager;
            if (manager == null) return;
            if (sinkPtr == IntPtr.Zero) sinkPtr = Marshal.GetComInterfaceForObject(sink, typeof(IAudioVolumeDuckNotification));
            // null: notifications about every session, not only our own
            manager.RegisterDuckNotification(null, sinkPtr);
        }

        /** Takes the queued notifications and the mic's sessions; sends what changed. */
        public static void Poll(IAudioSessionManager2 input)
        {
            KeyValuePair<string, bool> e;
            while (sink.Events.TryDequeue(out e))
            {
                if (e.Value) calls[e.Key] = AppOf(e.Key);
                else calls.Remove(e.Key);
            }
            Send("calls", calls.Values, ref lastCalls);
            Send("micusers", MicUsers(input), ref lastMic);
        }

        /** The apps with an active session on the default input. */
        static IEnumerable<string[]> MicUsers(IAudioSessionManager2 input)
        {
            var users = new List<string[]>();
            IAudioSessionEnumerator sessions;
            if (input == null || input.GetSessionEnumerator(out sessions) != 0) return users;
            int count;
            sessions.GetCount(out count);
            for (var i = 0; i < count; i++)
            {
                IAudioSessionControl2 session;
                if (sessions.GetSession(i, out session) != 0) continue;
                int state;
                session.GetState(out state);
                if (state != 1) continue;
                uint pid;
                session.GetProcessId(out pid);
                users.Add(Helper.WhoPid(pid));
            }
            return users;
        }

        /** A ducking session's app: by the process id at its end ("…|18%b37800"), else by the program in it. */
        static string[] AppOf(string sessionId)
        {
            var pid = Regex.Match(sessionId, @"%b(\d+)$");
            uint id;
            if (pid.Success && uint.TryParse(pid.Groups[1].Value, out id))
            {
                var who = Helper.WhoPid(id);
                if (!who[0].StartsWith("pid")) return who;
            }
            var exe = Regex.Match(sessionId, @"\\([^\\|%]+)\.exe%b", RegexOptions.IgnoreCase);
            var name = exe.Success ? exe.Groups[1].Value : "call";
            return new[] { name.ToLowerInvariant(), name, "" };
        }

        static void Send(string type, IEnumerable<string[]> apps, ref string last)
        {
            var items = apps.GroupBy(a => a[0]).Select(g => g.First()).OrderBy(a => a[0])
                .Select(a => "{\"app\":" + Helper.Quote(a[0]) + ",\"name\":" + Helper.Quote(a[1]) + "}");
            var json = "{\"t\":\"" + type + "\",\"list\":[" + string.Join(",", items) + "]}";
            if (json == last) return;
            last = json;
            Helper.Emit(json);
        }
    }
}
