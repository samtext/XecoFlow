import reconService from './services/recon.service.js';

const RECON_INTERVAL = 60 * 1000; // 60 Seconds

export const startBackgroundWorkers = () => {
    console.log("⚙️  [WORKER]: Lane 3 (Reconciliation) Heartbeat Started.");
    
    setInterval(async () => {
        await reconService.runReconciliation();
    }, RECON_INTERVAL);
};