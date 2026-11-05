export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const keys = Array.from({ length: 9 }, (_, index) => process.env[`NVIDIA_NIM_API_KEY_${index + 1}`]?.trim()).filter(Boolean);
  const count = new Set(keys).size;
  if (count === 0) {
    console.warn('NVIDIA NIM: no API keys are configured; AI features will be unavailable.');
  } else {
    console.info(`NVIDIA NIM: ${count} distinct API key${count === 1 ? '' : 's'} configured.`);
  }
}
