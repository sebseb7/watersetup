// Pumpensimulator - Event logging (browser console)

export function addLog(message, type = 'info') {
  console.log(`[${type}] ${message}`);
}
