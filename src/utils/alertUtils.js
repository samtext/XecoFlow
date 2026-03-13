// src/utils/alertUtils.js
import nodemailer from 'nodemailer';

/**
 * Send admin alert for high-value failures or reversal failures
 */
export const sendAdminAlert = async (alertData) => {
    console.log(`🔔 [ALERT] ${alertData.type}:`, alertData);

    // If email is configured, send email
    if (process.env.SMTP_HOST && process.env.ADMIN_EMAIL) {
        try {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT || 587,
                secure: false,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });

            await transporter.sendMail({
                from: process.env.SMTP_FROM,
                to: process.env.ADMIN_EMAIL,
                subject: `[XecoFlow Alert] ${alertData.type}`,
                html: `
                    <h2>⚠️ System Alert</h2>
                    <p><strong>Type:</strong> ${alertData.type}</p>
                    <p><strong>Transaction:</strong> ${alertData.transactionId}</p>
                    <p><strong>Amount:</strong> KES ${alertData.amount}</p>
                    <p><strong>Message:</strong> ${alertData.message || alertData.error}</p>
                    <p><strong>Time:</strong> ${new Date().toISOString()}</p>
                `
            });

            console.log(`📧 [ALERT] Email sent to admin`);
        } catch (error) {
            console.error(`❌ [ALERT] Failed to send email:`, error.message);
        }
    }

    // Could also send to Slack/Telegram here
};