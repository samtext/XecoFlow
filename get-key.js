import crypto from 'crypto';
import fs from 'fs';

// 🚩 Pointing to the ORIGINAL binary .cer file
const certPath = './src/cert/m_pesa_cert.cer.cer'; 

try {
    // 1. Read the file as a raw Buffer (binary), not as a string
    const certBuffer = fs.readFileSync(certPath);

    // 2. Use the X509 tool to parse the binary data directly
    const x509 = new crypto.X509Certificate(certBuffer);
    const publicKey = x509.publicKey;

    // 🚩 Replace with your actual SWANJIKU portal password
    const password = 'Your_Initiator_Password_Here'; 

    // 3. Encrypt using the extracted key
    const encrypted = crypto.publicEncrypt(
        {
            key: publicKey,
            padding: crypto.constants.RSA_PKCS1_PADDING,
        },
        Buffer.from(password)
    );

    console.log("\n✅ FINAL VICTORY! COPY THIS KEY:");
    console.log("--------------------------------------------------");
    console.log(encrypted.toString('base64'));
    console.log("--------------------------------------------------\n");
    console.log("💡 Put this in your .env as MPESA_SECURITY_CREDENTIAL");

} catch (err) {
    console.error("\n❌ ENCRYPTION FAILED:", err.message);
    console.log("\n💡 LAST CHECK: If it still says 'wrong tag', go back to the M-Pesa portal and download the certificate again. The current file might be corrupted.");
}