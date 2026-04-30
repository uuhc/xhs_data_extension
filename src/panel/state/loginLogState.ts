import { ref } from 'vue';

const LOGIN_LOG_MAX = 50;

export const loginLogs = ref<{ at: number; line: string }[]>([]);

export function appendLoginLog(line: string) {
  if (!line) return;
  loginLogs.value = [{ at: Date.now(), line }, ...loginLogs.value].slice(0, LOGIN_LOG_MAX);
}
