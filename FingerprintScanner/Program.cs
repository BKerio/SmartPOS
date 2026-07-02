using System.Net;
using System.Text;
using System.Text.Json;

ZkFingerprintSdk.ConfigureNativeLibraries();

var port = int.TryParse(Environment.GetEnvironmentVariable("FINGERPRINT_PORT"), out var p) ? p : 17890;
var bind = Environment.GetEnvironmentVariable("FINGERPRINT_BIND") ?? "*";
var listenHost = bind is "0.0.0.0" or "*" ? "*" : bind;

var corsOrigins = (Environment.GetEnvironmentVariable("FINGERPRINT_CORS_ORIGIN")
    ?? "http://localhost:5173,https://betterfork.millenium.co.ke")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

using var device = new FingerprintDevice();
var jsonOptions = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

Console.WriteLine("SmartPOS Fingerprint Scanner Service");
Console.WriteLine($"Listening on http://{listenHost}:{port} (all interfaces)");
Console.WriteLine($"CORS origins: {string.Join(", ", corsOrigins)}");
Console.WriteLine("Endpoints: GET /health  POST /prepare  POST /capture  POST /check-duplicate");
Console.WriteLine("Press Ctrl+C to stop.\n");

if (device.Initialize())
{
    Console.WriteLine($"Scanner ready ({device.DeviceCount} device(s) detected)\n");
}
else
{
    Console.WriteLine($"Warning: {device.LastError ?? "Scanner not ready"} - service will retry on capture\n");
}

HttpListener CreateListener(string host, int port)
{
    var l = new HttpListener();
    l.Prefixes.Add($"http://{host}:{port}/");
    return l;
}

HttpListener listener = CreateListener(listenHost, port);
try
{
    listener.Start();
}
catch (HttpListenerException ex) when (OperatingSystem.IsWindows() && ex.ErrorCode == 5 && listenHost == "*")
{
    // Windows requires an URLACL reservation to listen on http://*:PORT/
    Console.WriteLine($"Access denied binding to http://*:{port}/ on Windows.");
    Console.WriteLine("Run ONE of the following, then retry:");
    Console.WriteLine(@"  1) Run PowerShell/CMD as Administrator:");
    Console.WriteLine($@"     netsh http add urlacl url=http://+:{port}/ user=Everyone");
    Console.WriteLine(@"  2) Or set FINGERPRINT_BIND=localhost to only listen locally.");
    Console.WriteLine();

    listener.Close();
    listener = CreateListener("localhost", port);
    listener.Start();
}

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    cts.Cancel();
};

try
{
    while (!cts.Token.IsCancellationRequested)
    {
        var contextTask = listener.GetContextAsync();
        var completed = await Task.WhenAny(contextTask, Task.Delay(Timeout.Infinite, cts.Token));
        if (completed != contextTask) break;

        var context = await contextTask;
        _ = Task.Run(() => HandleRequest(context, device, jsonOptions, corsOrigins), cts.Token);
    }
}
finally
{
    listener.Stop();
    listener.Close();
    Console.WriteLine("\nScanner service stopped.");
}

static void HandleRequest(HttpListenerContext context, FingerprintDevice device, JsonSerializerOptions jsonOptions, string[] corsOrigins)
{
    var request = context.Request;
    var response = context.Response;

    try
    {
        AddCors(response, corsOrigins, request.Headers["Origin"]);

        if (request.HttpMethod == "OPTIONS")
        {
            response.StatusCode = 204;
            response.Close();
            return;
        }

        var path = request.Url?.AbsolutePath.TrimEnd('/') ?? "";

        if (request.HttpMethod == "GET" && path == "/health")
        {
            WriteJson(response, 200, new
            {
                ok = true,
                deviceConnected = device.IsReady || device.Initialize(),
                deviceCount = device.DeviceCount,
                message = device.LastError,
            }, jsonOptions);
            return;
        }

        if (request.HttpMethod == "POST" && path == "/prepare")
        {
            var ready = device.Prepare();
            WriteJson(response, ready ? 200 : 503, new
            {
                ok = ready,
                deviceConnected = device.IsReady,
                message = ready ? "Scanner ready" : device.LastError,
            }, jsonOptions);
            return;
        }

        if (request.HttpMethod == "POST" && path == "/check-duplicate")
        {
            using var reader = new StreamReader(request.InputStream, request.ContentEncoding);
            var body = reader.ReadToEnd();
            var payload = JsonSerializer.Deserialize<DuplicateCheckRequest>(body, jsonOptions);

            if (payload?.Template == null || payload.Candidates == null)
            {
                WriteJson(response, 422, new { ok = false, message = "template and candidates are required" }, jsonOptions);
                return;
            }

            byte[] candidate;
            try
            {
                candidate = Convert.FromBase64String(payload.Template);
            }
            catch
            {
                WriteJson(response, 422, new { ok = false, message = "Invalid template encoding" }, jsonOptions);
                return;
            }

            var existing = new List<byte[]>();
            foreach (var encoded in payload.Candidates)
            {
                if (string.IsNullOrWhiteSpace(encoded)) continue;
                try
                {
                    existing.Add(Convert.FromBase64String(encoded));
                }
                catch
                {
                    WriteJson(response, 422, new { ok = false, message = "Invalid candidate template encoding" }, jsonOptions);
                    return;
                }
            }

            var (isDuplicate, matchedIndex, score) = device.FindDuplicate(candidate, existing);
            WriteJson(response, 200, new
            {
                ok = true,
                isDuplicate,
                matchedIndex = isDuplicate ? matchedIndex : (int?)null,
                score = isDuplicate ? score : 0,
            }, jsonOptions);
            return;
        }

        if (request.HttpMethod == "POST" && path == "/capture")
        {
            var timeoutSec = 15;
            var q = request.QueryString["timeout"];
            if (int.TryParse(q, out var parsed) && parsed >= 5 && parsed <= 60)
                timeoutSec = parsed;

            Console.WriteLine($"Capture requested (timeout {timeoutSec}s) - place finger on scanner...");
            var captured = device.Capture(TimeSpan.FromSeconds(timeoutSec));

            if (captured == null)
            {
                WriteJson(response, 503, new
                {
                    ok = false,
                    message = device.LastError ?? "Failed to capture fingerprint",
                }, jsonOptions);
                return;
            }

            var (template, size) = captured.Value;
            var base64 = Convert.ToBase64String(template);
            Console.WriteLine($"Fingerprint captured ({size} bytes)");

            WriteJson(response, 200, new
            {
                ok = true,
                template = base64,
                size,
            }, jsonOptions);
            return;
        }

        WriteJson(response, 404, new { ok = false, message = "Not found" }, jsonOptions);
    }
    catch (Exception ex)
    {
        WriteJson(response, 500, new { ok = false, message = ex.Message }, jsonOptions);
    }
}

static void AddCors(HttpListenerResponse response, string[] allowedOrigins, string? requestOrigin)
{
    var origin = requestOrigin != null && allowedOrigins.Contains(requestOrigin)
        ? requestOrigin
        : allowedOrigins[0];

    response.Headers.Add("Access-Control-Allow-Origin", origin);
    response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.Headers.Add("Access-Control-Allow-Headers", "Content-Type");
}

static void WriteJson(HttpListenerResponse response, int statusCode, object payload, JsonSerializerOptions options)
{
    var json = JsonSerializer.Serialize(payload, options);
    var buffer = Encoding.UTF8.GetBytes(json);
    response.StatusCode = statusCode;
    response.ContentType = "application/json";
    response.ContentEncoding = Encoding.UTF8;
    response.ContentLength64 = buffer.Length;
    response.OutputStream.Write(buffer, 0, buffer.Length);
    response.Close();
}

file sealed class DuplicateCheckRequest
{
    public string? Template { get; set; }
    public List<string>? Candidates { get; set; }
}
