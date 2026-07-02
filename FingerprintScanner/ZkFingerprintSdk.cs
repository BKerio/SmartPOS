using System.Reflection;
using System.Runtime.InteropServices;

/// <summary>
/// Cross-platform P/Invoke wrapper for ZKTeco libzkfp (Windows: libzkfp.dll, Linux: libzkfp.so).
/// </summary>
static class ZkFingerprintSdk
{
    public const int ErrOk = 0;
    private const string LibName = "libzkfp";
    private static bool _configured;
    private static IntPtr _libHandle = IntPtr.Zero;

    public static void ConfigureNativeLibraries()
    {
        if (_configured) return;
        _configured = true;

        var libsDir = Path.Combine(AppContext.BaseDirectory, "libs");
        if (!Directory.Exists(libsDir))
            return;

        if (OperatingSystem.IsLinux())
        {
            var existing = Environment.GetEnvironmentVariable("LD_LIBRARY_PATH") ?? "";
            if (!existing.Split(':', StringSplitOptions.RemoveEmptyEntries).Contains(libsDir))
            {
                Environment.SetEnvironmentVariable(
                    "LD_LIBRARY_PATH",
                    string.IsNullOrEmpty(existing) ? libsDir : $"{libsDir}:{existing}");
            }

            PreloadLinuxLibraries(libsDir);
        }

        NativeLibrary.SetDllImportResolver(Assembly.GetExecutingAssembly(), ResolveNativeLibrary);
    }

    private const int RtlLazy = 0x1;
    private const int RtlGlobal = 0x100;

    [DllImport("libdl.so.2", CharSet = CharSet.Ansi)]
    private static extern IntPtr dlopen(string fileName, int flags);

    [DllImport("libdl.so.2", CharSet = CharSet.Ansi)]
    private static extern IntPtr dlerror();

    private static void PreloadLinuxLibraries(string libsDir)
    {
        // Load dependencies before libzkfp.so with RTLD_GLOBAL so libzkfp can resolve them.
        var ordered = new[]
        {
            "libiomp5.so",
            "libcrypto.so.0.9.8",
            "libsqlite3.so.0",
            "libusb-0.1.so.4",
            "libidkit.so.2",
            "libsilkidcap.so",
            "libzkfinger10.so",
            "libzkfp.so",
        };

        foreach (var name in ordered)
        {
            var path = Path.Combine(libsDir, name);
            if (!File.Exists(path)) continue;

            var handle = dlopen(path, RtlLazy | RtlGlobal);
            if (handle == IntPtr.Zero)
            {
                var errPtr = dlerror();
                var err = errPtr != IntPtr.Zero ? Marshal.PtrToStringAnsi(errPtr) : "unknown error";
                Console.WriteLine($"Warning: could not preload {name}: {err}");
                continue;
            }

            if (name == "libzkfp.so")
                _libHandle = handle;
        }
    }

    private static IntPtr ResolveNativeLibrary(string libraryName, Assembly assembly, DllImportSearchPath? searchPath)
    {
        if (!libraryName.Equals(LibName, StringComparison.OrdinalIgnoreCase) &&
            !libraryName.Equals($"{LibName}.dll", StringComparison.OrdinalIgnoreCase) &&
            !libraryName.Equals($"{LibName}.so", StringComparison.OrdinalIgnoreCase))
        {
            return IntPtr.Zero;
        }

        var libsDir = Path.Combine(AppContext.BaseDirectory, "libs");
        var fileName = OperatingSystem.IsWindows() ? "libzkfp.dll" : "libzkfp.so";
        var path = Path.Combine(libsDir, fileName);
        if (File.Exists(path))
        {
            _libHandle = NativeLibrary.Load(path);
            return _libHandle;
        }

        return _libHandle != IntPtr.Zero ? _libHandle : IntPtr.Zero;
    }

    [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
    private static extern int ZKFPM_Init();

    [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
    private static extern int ZKFPM_Terminate();

    [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
    private static extern int ZKFPM_GetDeviceCount();

    [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
    private static extern IntPtr ZKFPM_OpenDevice(int index);

    [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
    private static extern int ZKFPM_CloseDevice(IntPtr handle);

    [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
    private static extern int ZKFPM_AcquireFingerprint(
        IntPtr handle,
        IntPtr fpImage,
        uint cbFPImage,
        IntPtr fpTemplate,
        ref int cbTemplate);

    [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
    private static extern IntPtr ZKFPM_CreateDBCache();

    [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
    private static extern int ZKFPM_CloseDBCache(IntPtr hDBCache);

    [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
    private static extern int ZKFPM_MatchFinger(
        IntPtr hDBCache,
        IntPtr fpTemplate1,
        uint cbTemplate1,
        IntPtr fpTemplate2,
        uint cbTemplate2);

    public static int Init()
    {
        ConfigureNativeLibraries();
        return ZKFPM_Init();
    }

    public static int Terminate() => ZKFPM_Terminate();

    public static int GetDeviceCount() => ZKFPM_GetDeviceCount();

    public static IntPtr OpenDevice(int index) => ZKFPM_OpenDevice(index);

    public static int CloseDevice(IntPtr handle) => ZKFPM_CloseDevice(handle);

    public static int AcquireFingerprint(IntPtr device, byte[] image, byte[] template, ref int templateSize)
    {
        if (device == IntPtr.Zero)
            return -1;

        templateSize = template.Length;
        return ZKFPM_AcquireFingerprint(
            device,
            Marshal.UnsafeAddrOfPinnedArrayElement(image, 0),
            (uint)image.Length,
            Marshal.UnsafeAddrOfPinnedArrayElement(template, 0),
            ref templateSize);
    }

    public static IntPtr DBInit() => ZKFPM_CreateDBCache();

    public static int DBFree(IntPtr dbHandle) => ZKFPM_CloseDBCache(dbHandle);

    public static int DBMatch(IntPtr dbHandle, byte[] template1, byte[] template2)
    {
        if (dbHandle == IntPtr.Zero)
            return -1;

        return ZKFPM_MatchFinger(
            dbHandle,
            Marshal.UnsafeAddrOfPinnedArrayElement(template1, 0),
            (uint)template1.Length,
            Marshal.UnsafeAddrOfPinnedArrayElement(template2, 0),
            (uint)template2.Length);
    }
}
