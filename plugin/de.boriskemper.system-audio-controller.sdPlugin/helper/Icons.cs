// An app's icon as 128×128 PNGs (base64), in colour and greyed out (for an app that isn't running;
// Stream Deck's SVG renderer can't grey it itself). From the Windows shell's image lists: the jumbo
// icon (256 px) when the program has one, else the extra-large one (48 px), scaled up.
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

namespace SacAudio
{
    [Guid("46EB5926-582E-4017-9FDF-E8998DAA0950"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IImageList
    {
        int Add(IntPtr a, IntPtr b, out int c);
        int ReplaceIcon(int a, IntPtr b, out int c);
        int SetOverlayImage(int a, int b);
        int Replace(int a, IntPtr b, IntPtr c);
        int AddMasked(IntPtr a, int b, out int c);
        int Draw(IntPtr a);
        int Remove(int a);
        int GetIcon(int index, int flags, out IntPtr icon);
    }

    static class Icons
    {
        const int SIZE = 128, SHIL_EXTRALARGE = 2, SHIL_JUMBO = 4, ILD_TRANSPARENT = 1;
        const uint SHGFI_SYSICONINDEX = 0x4000;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct SHFILEINFO
        {
            public IntPtr hIcon;
            public int iIcon;
            public uint dwAttributes;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szDisplayName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)] public string szTypeName;
        }

        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        static extern IntPtr SHGetFileInfo(string path, uint attributes, ref SHFILEINFO info, uint size, uint flags);

        [DllImport("shell32.dll", EntryPoint = "#727")]
        static extern int SHGetImageList(int list, ref Guid iid, out IImageList images);

        [DllImport("user32.dll")]
        static extern bool DestroyIcon(IntPtr icon);

        /** The icon of `exePath` in colour and grey, or null. */
        public static string[] Png(string exePath)
        {
            try
            {
                var info = new SHFILEINFO();
                if (SHGetFileInfo(exePath, 0, ref info, (uint)Marshal.SizeOf(info), SHGFI_SYSICONINDEX) == IntPtr.Zero) return null;
                var bitmap = FromList(SHIL_JUMBO, info.iIcon);
                // Programs without a large icon get their small one in the corner of the jumbo image
                if (bitmap == null || Content(bitmap).Width <= 64) bitmap = FromList(SHIL_EXTRALARGE, info.iIcon);
                if (bitmap == null) return null;
                var box = Content(bitmap);
                using (bitmap)
                    return new[] { Draw(bitmap, box, null), Draw(bitmap, box, Grey) };
            }
            catch
            {
                return null;
            }
        }

        /** Luminance, at 55 % opacity. */
        static readonly ColorMatrix Grey = new ColorMatrix(new[]
        {
            new[] { 0.3f, 0.3f, 0.3f, 0, 0 },
            new[] { 0.59f, 0.59f, 0.59f, 0, 0 },
            new[] { 0.11f, 0.11f, 0.11f, 0, 0 },
            new[] { 0, 0, 0, 0.55f, 0 },
            new[] { 0, 0, 0, 0, 1f },
        });

        static string Draw(Bitmap source, Rectangle box, ColorMatrix matrix)
        {
            using (var scaled = new Bitmap(SIZE, SIZE, PixelFormat.Format32bppArgb))
            using (var g = Graphics.FromImage(scaled))
            using (var attributes = new ImageAttributes())
            using (var png = new MemoryStream())
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                if (matrix != null) attributes.SetColorMatrix(matrix);
                g.DrawImage(source, new Rectangle(0, 0, SIZE, SIZE), box.X, box.Y, box.Width, box.Height, GraphicsUnit.Pixel, attributes);
                scaled.Save(png, ImageFormat.Png);
                return Convert.ToBase64String(png.ToArray());
            }
        }

        static Bitmap FromList(int list, int index)
        {
            var iid = typeof(IImageList).GUID;
            IImageList images;
            if (SHGetImageList(list, ref iid, out images) != 0) return null;
            IntPtr handle;
            if (images.GetIcon(index, ILD_TRANSPARENT, out handle) != 0 || handle == IntPtr.Zero) return null;
            try
            {
                using (var icon = Icon.FromHandle(handle)) return icon.ToBitmap();
            }
            finally
            {
                DestroyIcon(handle);
            }
        }

        /** The square around the visible pixels (so a small icon fills the image). */
        static Rectangle Content(Bitmap b)
        {
            int minX = b.Width, minY = b.Height, maxX = -1, maxY = -1;
            for (var y = 0; y < b.Height; y++)
                for (var x = 0; x < b.Width; x++)
                {
                    if (b.GetPixel(x, y).A < 16) continue;
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            if (maxX < 0) return new Rectangle(0, 0, b.Width, b.Height);
            var side = Math.Max(maxX - minX, maxY - minY) + 1;
            var cx = (minX + maxX) / 2;
            var cy = (minY + maxY) / 2;
            return new Rectangle(cx - side / 2, cy - side / 2, side, side);
        }
    }
}
