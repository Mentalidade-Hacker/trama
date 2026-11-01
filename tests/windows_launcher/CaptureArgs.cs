using System;
using System.IO;
using System.Text;
public static class CaptureArgs
{
    public static int Main(string[] args)
    {
        string output = Environment.GetEnvironmentVariable("TRAMA_TEST_CAPTURE");
        string[] encoded = new string[args.Length];
        for (int i = 0; i < args.Length; i++) encoded[i] = Convert.ToBase64String(Encoding.UTF8.GetBytes(args[i]));
        File.WriteAllLines(output, encoded, Encoding.UTF8);
        return 0;
    }
}
