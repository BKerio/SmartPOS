using System;
using System.Collections.Generic;
using System.Threading;

sealed class FingerprintDevice : IDisposable
{
    private IntPtr _device = IntPtr.Zero;
    private IntPtr _dbHandle = IntPtr.Zero;
    private bool _initialized;
    private readonly object _lock = new();

    public bool IsReady => _initialized && _device != IntPtr.Zero;

    public int DeviceCount { get; private set; }

    public string? LastError { get; private set; }

    public bool Initialize()
    {
        lock (_lock)
        {
            if (_initialized) return IsReady;

            int ret;
            try
            {
                ret = ZkFingerprintSdk.Init();
            }
            catch (DllNotFoundException)
            {
                LastError = OperatingSystem.IsWindows()
                    ? "ZKTeco SDK not found - install drivers from FingerprintScanner/Setup and ensure libzkfp.dll is in libs/"
                    : "ZKTeco Linux SDK not found - ensure LinuxSDK/lib-x64/*.so files are copied to the build output libs/ folder";
                return false;
            }

            if (ret != ZkFingerprintSdk.ErrOk)
            {
                LastError = ret switch
                {
                    -1 => "Failed to initialize fingerprint algorithm library",
                    -2 => DescribeCaptureInitFailure(),
                    -3 => "No fingerprint scanner connected via USB",
                    _ => $"Failed to initialize fingerprint SDK (error {ret})",
                };
                return false;
            }

            _initialized = true;
            DeviceCount = ZkFingerprintSdk.GetDeviceCount();

            if (DeviceCount <= 0)
            {
                LastError = "No fingerprint scanner detected";
                return false;
            }

            _device = ZkFingerprintSdk.OpenDevice(0);
            if (_device == IntPtr.Zero)
            {
                LastError = "Failed to open fingerprint scanner";
                return false;
            }

            // Warm matcher now so first duplicate check is not delayed
            _ = GetDbHandle();

            LastError = null;
            return true;
        }
    }

    private IntPtr GetDbHandle()
    {
        if (_dbHandle == IntPtr.Zero)
        {
            if (!_initialized && !Initialize())
                throw new InvalidOperationException(LastError ?? "Scanner not initialized");

            _dbHandle = ZkFingerprintSdk.DBInit();
            if (_dbHandle == IntPtr.Zero)
                throw new InvalidOperationException("Failed to initialize fingerprint matcher");
        }

        return _dbHandle;
    }

    /// <summary>Wakes the device so the next capture starts faster.</summary>
    public bool Prepare()
    {
        lock (_lock)
        {
            if (!IsReady && !Initialize())
                return false;

            byte[] fpImage = new byte[1024 * 1024];
            byte[] fpTemplate = new byte[2048];
            int size = 2048;
            ZkFingerprintSdk.AcquireFingerprint(_device, fpImage, fpTemplate, ref size);
            LastError = null;
            return true;
        }
    }

    public (byte[] template, int size)? Capture(TimeSpan timeout)
    {
        lock (_lock)
        {
            if (!IsReady && !Initialize())
                return null;

            byte[] fpImage = new byte[1024 * 1024];
            byte[] fpTemplate = new byte[2048];
            int size = 2048;
            var deadline = DateTime.UtcNow.Add(timeout);

            while (DateTime.UtcNow < deadline)
            {
                size = 2048;
                int result = ZkFingerprintSdk.AcquireFingerprint(_device, fpImage, fpTemplate, ref size);
                if (result == ZkFingerprintSdk.ErrOk && size > 0)
                {
                    var template = new byte[size];
                    Array.Copy(fpTemplate, template, size);
                    LastError = null;
                    return (template, size);
                }

                Thread.Sleep(20);
            }

            LastError = "Timed out waiting for fingerprint";
            return null;
        }
    }

    /// <summary>
    /// Compare candidate against existing templates using ZKTeco DBMatch (score &gt; 0 = same finger).
    /// </summary>
    public (bool isDuplicate, int matchedIndex, int score) FindDuplicate(byte[] candidate, IReadOnlyList<byte[]> existing)
    {
        lock (_lock)
        {
            if (existing.Count == 0)
                return (false, -1, 0);

            IntPtr db = GetDbHandle();

            for (int i = 0; i < existing.Count; i++)
            {
                int score = ZkFingerprintSdk.DBMatch(db, candidate, existing[i]);
                if (score > 0)
                    return (true, i, score);
            }

            return (false, -1, 0);
        }
    }

    public void Dispose()
    {
        lock (_lock)
        {
            if (_dbHandle != IntPtr.Zero)
            {
                ZkFingerprintSdk.DBFree(_dbHandle);
                _dbHandle = IntPtr.Zero;
            }

            if (_device != IntPtr.Zero)
            {
                ZkFingerprintSdk.CloseDevice(_device);
                _device = IntPtr.Zero;
            }

            if (_initialized)
            {
                ZkFingerprintSdk.Terminate();
                _initialized = false;
            }
        }
    }

    private static string DescribeCaptureInitFailure()
    {
        if (!OperatingSystem.IsLinux())
            return "Failed to initialize fingerprint capture library";

        var usbDevices = Directory.Exists("/sys/bus/usb/devices")
            ? Directory.GetFiles("/sys/bus/usb/devices").Length
            : 0;

        if (usbDevices == 0)
        {
            return "Failed to initialize fingerprint capture library - this host has no USB devices. "
                + "A cloud VM (e.g. GCP) cannot see a scanner plugged into your local PC. "
                + "Run 'dotnet run' on the machine where the ZK9500 is physically connected via USB.";
        }

        return "Failed to initialize fingerprint capture library - USB is present but the ZK9500 was not detected. "
            + "Check the cable, try another USB port, and ensure your user can access /dev/bus/usb (plugdev group / udev rules).";
    }
}
