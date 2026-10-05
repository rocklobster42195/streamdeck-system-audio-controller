// Windows' media sessions (what the media overlay shows: Spotify, a browser tab, Media Player): what
// plays, its position and cover, and play/pause, next … on them. Through WinRT
// (Windows.Media.Control, Windows 10 1809+); sac-audio.ps1 leaves this file out when the system
// can't compile it, and the helper then runs without media.
//
// Out:
//   {"t":"media","list":[{"id":"Spotify.exe","status":"playing","title":"…","artist":"…","album":"…",
//     "pos":44.1,"dur":263.9,"at":1759650000000,"shuffle":false,"repeat":"off","can":"play-pause,next,…","cover":"3f2a…"}]}   on change
//   {"t":"mediacover","cover":"3f2a…","type":"image/jpeg","data":"<base64>","rgb":[217,100,58]}   once per cover, before the list naming it
// In:
//   {"cmd":"media","ref":"7","id":"Spotify.exe","do":"next"}   do: play-pause, play, pause, next, previous, seek (value: seconds), shuffle (value: true/false), repeat (value: off/one/all)
//   answered with {"t":"mediadone","ref":"7"} or {"t":"mediadone","ref":"7","error":"…"}
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using Windows.Foundation;
using Windows.Media;
using Windows.Media.Control;
using Windows.Storage.Streams;

namespace SacAudio
{
    static class Media
    {
        /** How long a call into WinRT may take before we give up on it. */
        const int WAIT_MS = 2000;
        /** Title, artist and cover are asked for at most this often per session (playback state every poll). */
        const int PROPERTIES_MS = 1000;
        /** A session's properties age that makes the next poll ask for them. */
        const int ASK_NOW = 1 << 20;

        class Session
        {
            public GlobalSystemMediaTransportControlsSession Control;
            public string Title = "", Artist = "", Album = "", Cover = "";
            public string TrackKey;
            public int PropertiesAge = ASK_NOW;
        }

        static GlobalSystemMediaTransportControlsSessionManager manager;
        static bool failed;
        static readonly Dictionary<string, Session> sessions = new Dictionary<string, Session>();
        static readonly HashSet<string> coversSent = new HashSet<string>();
        static string lastList = "";

        /** Called from the helper's loop every `elapsed` ms. */
        public static void Poll(int elapsed)
        {
            if (failed) return;
            if (manager == null)
            {
                try
                {
                    manager = Wait(GlobalSystemMediaTransportControlsSessionManager.RequestAsync());
                }
                catch (Exception e)
                {
                    failed = true;
                    Helper.Emit("{\"t\":\"error\",\"message\":" + Helper.Quote("media: " + e.Message) + "}");
                    return;
                }
                if (manager == null) return;
            }
            var seen = new Dictionary<string, Session>();
            foreach (var control in manager.GetSessions())
            {
                var id = control.SourceAppUserModelId ?? "";
                // Two sessions of one app (two browser windows): "#2", "#3" …
                var unique = id;
                for (var n = 2; seen.ContainsKey(unique); n++) unique = id + "#" + n;
                Session s;
                if (!sessions.TryGetValue(unique, out s) || s.Control.SourceAppUserModelId != id) s = new Session();
                s.Control = control;
                s.PropertiesAge = Math.Min(ASK_NOW, s.PropertiesAge + elapsed);
                seen[unique] = s;
            }
            sessions.Clear();
            foreach (var pair in seen) sessions[pair.Key] = pair.Value;

            var items = new List<string>();
            foreach (var pair in sessions)
            {
                var item = Describe(pair.Key, pair.Value);
                if (item != null) items.Add(item);
            }
            var json = "{\"t\":\"media\",\"list\":[" + string.Join(",", items) + "]}";
            if (json == lastList) return;
            lastList = json;
            Helper.Emit(json);
        }

        /** Carries out a "media" command; throws when the session doesn't take it. */
        public static void Command(string id, string what, string value)
        {
            Session s;
            if (!sessions.TryGetValue(id, out s)) throw new Exception("no media session " + id);
            var c = s.Control;
            IAsyncOperation<bool> op;
            switch (what)
            {
                case "play-pause": op = c.TryTogglePlayPauseAsync(); break;
                case "play": op = c.TryPlayAsync(); break;
                case "pause": op = c.TryPauseAsync(); break;
                case "next": op = c.TrySkipNextAsync(); break;
                case "previous": op = c.TrySkipPreviousAsync(); break;
                case "seek":
                    var seconds = double.Parse(value, System.Globalization.CultureInfo.InvariantCulture);
                    var start = c.GetTimelineProperties().StartTime;
                    op = c.TryChangePlaybackPositionAsync((start + TimeSpan.FromSeconds(Math.Max(0, seconds))).Ticks);
                    break;
                case "shuffle": op = c.TryChangeShuffleActiveAsync(value == "true"); break;
                case "repeat":
                    var mode = value == "one" ? MediaPlaybackAutoRepeatMode.Track : value == "all" ? MediaPlaybackAutoRepeatMode.List : MediaPlaybackAutoRepeatMode.None;
                    op = c.TryChangeAutoRepeatModeAsync(mode);
                    break;
                default: throw new Exception("unknown media command " + what);
            }
            if (!Wait(op)) throw new Exception(id + " refused " + what);
            // Ask for title and cover again at once: next/previous change them
            s.PropertiesAge = ASK_NOW;
        }

        static string Describe(string id, Session s)
        {
            var c = s.Control;
            if (s.PropertiesAge >= PROPERTIES_MS)
            {
                s.PropertiesAge = 0;
                try
                {
                    var p = Wait(c.TryGetMediaPropertiesAsync());
                    if (p != null)
                    {
                        s.Title = p.Title ?? "";
                        s.Artist = string.IsNullOrEmpty(p.Artist) ? p.AlbumArtist ?? "" : p.Artist;
                        s.Album = p.AlbumTitle ?? "";
                        var key = s.Title + "\n" + s.Artist + "\n" + s.Album;
                        if (key != s.TrackKey)
                        {
                            s.TrackKey = key;
                            s.Cover = p.Thumbnail != null ? SendCover(p.Thumbnail) : "";
                        }
                    }
                }
                catch (Exception e)
                {
                    // An app that closes while we ask: it's gone from the list on the next poll
                    Helper.Emit("{\"t\":\"error\",\"message\":" + Helper.Quote("media " + id + ": " + e.Message) + "}");
                }
            }
            var pb = c.GetPlaybackInfo();
            if (pb == null) return null;
            var tl = c.GetTimelineProperties();
            var sb = new StringBuilder("{\"id\":").Append(Helper.Quote(id));
            sb.Append(",\"status\":\"").Append(Status(pb.PlaybackStatus)).Append('"');
            sb.Append(",\"title\":").Append(Helper.Quote(s.Title));
            sb.Append(",\"artist\":").Append(Helper.Quote(s.Artist));
            sb.Append(",\"album\":").Append(Helper.Quote(s.Album));
            if (tl != null && tl.EndTime > tl.StartTime)
            {
                sb.Append(",\"pos\":").Append(Seconds(tl.Position - tl.StartTime));
                sb.Append(",\"dur\":").Append(Seconds(tl.EndTime - tl.StartTime));
                sb.Append(",\"at\":").Append(tl.LastUpdatedTime.ToUnixTimeMilliseconds());
            }
            if (pb.IsShuffleActive.HasValue) sb.Append(",\"shuffle\":").Append(Helper.Bool(pb.IsShuffleActive.Value));
            if (pb.AutoRepeatMode.HasValue) sb.Append(",\"repeat\":\"").Append(Repeat(pb.AutoRepeatMode.Value)).Append('"');
            sb.Append(",\"can\":\"").Append(Can(pb.Controls)).Append('"');
            if (s.Cover != "") sb.Append(",\"cover\":\"").Append(s.Cover).Append('"');
            return sb.Append('}').ToString();
        }

        static string Can(GlobalSystemMediaTransportControlsSessionPlaybackControls k)
        {
            var can = new List<string>();
            if (k.IsPlayPauseToggleEnabled || (k.IsPlayEnabled && k.IsPauseEnabled)) can.Add("play-pause");
            if (k.IsPlayEnabled) can.Add("play");
            if (k.IsPauseEnabled) can.Add("pause");
            if (k.IsNextEnabled) can.Add("next");
            if (k.IsPreviousEnabled) can.Add("previous");
            if (k.IsPlaybackPositionEnabled) can.Add("seek");
            if (k.IsShuffleEnabled) can.Add("shuffle");
            if (k.IsRepeatEnabled) can.Add("repeat");
            return string.Join(",", can);
        }

        static string Status(GlobalSystemMediaTransportControlsSessionPlaybackStatus st)
        {
            switch (st)
            {
                case GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing: return "playing";
                case GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused: return "paused";
                case GlobalSystemMediaTransportControlsSessionPlaybackStatus.Stopped: return "stopped";
                default: return "other";
            }
        }

        static string Repeat(MediaPlaybackAutoRepeatMode m)
        {
            return m == MediaPlaybackAutoRepeatMode.Track ? "one" : m == MediaPlaybackAutoRepeatMode.List ? "all" : "off";
        }

        static string Seconds(TimeSpan t)
        {
            return Math.Round(Math.Max(0, t.TotalSeconds), 1).ToString("0.0", System.Globalization.CultureInfo.InvariantCulture);
        }

        /** Reads the cover, sends it once (keyed by its content) and returns its key; "" when unreadable. */
        static string SendCover(IRandomAccessStreamReference thumb)
        {
            try
            {
                // Reading the stream never finishes on PowerShell's STA thread (it waits for a message
                // loop we don't run), so it runs on an MTA thread of its own
                byte[] bytes = null;
                string type = null;
                Exception failure = null;
                var reading = new Thread(() =>
                {
                    try
                    {
                        var stream = Wait(thumb.OpenReadAsync());
                        var size = (uint)stream.Size;
                        if (size == 0 || size > 4 * 1024 * 1024) return;
                        var reader = new DataReader(stream);
                        Wait(reader.LoadAsync(size));
                        bytes = new byte[size];
                        reader.ReadBytes(bytes);
                        type = stream.ContentType;
                    }
                    catch (Exception e)
                    {
                        failure = e;
                    }
                });
                reading.SetApartmentState(ApartmentState.MTA);
                reading.IsBackground = true;
                reading.Start();
                if (!reading.Join(2 * WAIT_MS)) throw new TimeoutException("cover took too long");
                if (failure != null) throw failure;
                if (bytes == null) return "";
                string key;
                using (var md5 = MD5.Create()) key = string.Concat(md5.ComputeHash(bytes).Take(8).Select(b => b.ToString("x2")));
                if (coversSent.Add(key))
                {
                    var rgb = Accent(bytes);
                    if (string.IsNullOrEmpty(type)) type = "image/jpeg";
                    Helper.Emit("{\"t\":\"mediacover\",\"cover\":\"" + key + "\",\"type\":" + Helper.Quote(type) + ",\"data\":\"" + Convert.ToBase64String(bytes) + "\"" +
                        (rgb != null ? ",\"rgb\":[" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "]" : "") + "}");
                }
                return key;
            }
            catch (Exception e)
            {
                Helper.Emit("{\"t\":\"error\",\"message\":" + Helper.Quote("media cover: " + e.Message) + "}");
                return "";
            }
        }

        /**
         * The cover's most colourful tone: the average of its colourful pixels, each weighted by how
         * colourful it is; a grey cover gives its average grey (readableCoverColor keeps that grey).
         */
        static int[] Accent(byte[] image)
        {
            try
            {
                using (var ms = new MemoryStream(image))
                using (var src = new Bitmap(ms))
                using (var small = new Bitmap(src, new Size(24, 24)))
                {
                    double r = 0, g = 0, b = 0, w = 0, ar = 0, ag = 0, ab = 0;
                    for (var y = 0; y < small.Height; y++)
                        for (var x = 0; x < small.Width; x++)
                        {
                            var px = small.GetPixel(x, y);
                            ar += px.R; ag += px.G; ab += px.B;
                            var max = Math.Max(px.R, Math.Max(px.G, px.B)) / 255.0;
                            var min = Math.Min(px.R, Math.Min(px.G, px.B)) / 255.0;
                            var sat = max > 0 ? (max - min) / max : 0;
                            if (sat < 0.25 || max < 0.2) continue;
                            var weight = sat * sat * max;
                            r += px.R * weight; g += px.G * weight; b += px.B * weight; w += weight;
                        }
                    var n = small.Width * small.Height;
                    return w > 0.5 ? new[] { (int)(r / w), (int)(g / w), (int)(b / w) } : new[] { (int)(ar / n), (int)(ag / n), (int)(ab / n) };
                }
            }
            catch
            {
                return null;
            }
        }

        /** Waits for a WinRT call by watching its status (no Task bridge: that needs the SDK's Windows.winmd). */
        static T Wait<T>(IAsyncOperation<T> op)
        {
            var deadline = Environment.TickCount + WAIT_MS;
            while (op.Status == AsyncStatus.Started)
            {
                if (Environment.TickCount - deadline > 0)
                {
                    op.Cancel();
                    throw new TimeoutException("no answer from Windows");
                }
                Thread.Sleep(2);
            }
            if (op.Status != AsyncStatus.Completed) throw op.ErrorCode ?? new Exception("cancelled");
            return op.GetResults();
        }
    }
}
