/**
 * BIG-SYSTEM-V1.2 | DATABASE SERVICE
 * FILE: dbServices.js
 */
import { db } from '../config/db.js';
import { v4 as uuidv4 } from 'uuid'; 

class DbService {
    /**
     * 1. CREATE INITIAL TRANSACTION
     */
    async createTransactionRecord(phone, amount, userId) {
        if (!userId) {
            throw new Error("SYSTEM_RULE_VIOLATION: user_id is missing.");
        }

        console.log(`📝 DB_SERVICE: Initializing record for ${phone}...`);
        
        // Use 'network' instead of 'provider' based on common M-Pesa schemas
        const { data, error } = await db.transactions().insert([{
            user_id: userId,
            amount: amount,
            phone_number: phone,
            network: 'SAFARICOM',           // Changed back to 'network'
            status: 'INITIATED',
            idempotency_key: uuidv4(),
            metadata: { source: 'integrated_test_v1' }
        }]).select().single();

        if (error) {
            // If it fails again, check if your column is actually named 'service_provider' 
            console.error("📑 DB ERROR DETAILS:", error);
            throw new Error(`DB_INIT_ERROR: ${error.message}`);
        }

        console.log(`✅ DB_SERVICE: Record created. ID: ${data.id}`);
        return data;
    }

    /**
     * 2. LINK CHECKOUT ID TO TRANSACTION
     */
    async linkCheckoutId(internalId, checkoutId) {
        console.log(`🔗 DB_SERVICE: Linking CheckoutID ${checkoutId}...`);
        
        const { error } = await db.transactions()
            .update({ 
                checkout_id: checkoutId, 
                status: 'PENDING_PAYMENT' 
            })
            .eq('id', internalId);

        if (error) throw new Error(`DB_LINK_ERROR: ${error.message}`);
        return true;
    }

    /**
     * 3. LOG CALLBACK DATA (NEWLY ADDED)
     * Target: mpesa_callback_logs
     */
    async logMpesaCallback(payload, ipAddress) {
        console.log(`📡 DB_SERVICE: Logging callback from ${ipAddress}...`);

        const { data, error } = await db.from('mpesa_callback_logs').insert([{
            // Note: 'id' is omitted as the DB now generates the UUID automatically
            payload: payload,
            ip_address: ipAddress,
            created_at: new Date().toISOString()
        }]);

        if (error) {
            console.error("⚠️ DB_LOG_ERROR:", error.message);
            // We don't throw an error here to prevent the whole callback from crashing
            return null;
        }

        return data;
    }
}

export default new DbService();