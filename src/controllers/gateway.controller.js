/**
 * 📩 GATEWAY CONTROLLER
 * Handles incoming data from Safaricom (Callbacks)
 */
export const handleReconResult = async (req, res) => {
    try {
        const { Result } = req.body;

        if (!Result) {
            console.warn("⚠️ [GATEWAY]: Received empty payload.");
            return res.status(400).json({ ResponseCode: "1", ResponseDesc: "Empty Payload" });
        }

        const { ResultCode, ResultDesc, ConversationID, ResultParameters } = Result;

        if (ResultCode === 0) {
            // Safaricom sends balance as a string: "KES|9203342|Current|Available|Reserved|Uncleared"
            const balanceParam = ResultParameters?.ResultParameter?.find(p => p.Key === 'AccountBalance');
            const rawBalance = balanceParam?.Value || "0";

            console.log(`✅ [RECON_SUCCESS]: Conversation ${ConversationID} resolved.`);
            console.log(`💰 [STORE_9203342_STATE]: ${rawBalance}`);

            // TODO: Update your DB here
            // Example: await db.ledger.upsert({ ... });

        } else {
            console.error(`❌ [RECON_REJECTED]: ${ResultDesc} (Code: ${ResultCode})`);
        }

        // 🚩 CRITICAL: Safaricom needs a 200 OK to stop retrying the request
        return res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });

    } catch (error) {
        console.error("🔥 [GATEWAY_ERROR]:", error.message);
        return res.status(500).json({ ResultCode: 1, ResultDesc: "Internal Server Error" });
    }
};

export const handleReconTimeout = (req, res) => {
    console.error("⏰ [RECON_TIMEOUT]: Safaricom took too long to respond.");
    res.status(200).json({ ResultCode: 0, ResultDesc: "Timeout Acknowledged" });
};