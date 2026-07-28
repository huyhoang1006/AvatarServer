/**
 * Session bookkeeping chỉ sống trong Redis — nó được dựng lại từ JWT và đồng hồ
 * mỗi lần auth, nên lưu xuống Postgres chỉ tổ phình cột `user_profiles.data`.
 *
 * `data` nằm trong danh sách này vì bản cũ từng bọc cả blob dưới key đó; bỏ key
 * lúc lưu cũng tự dọn luôn các row bị lồng từ trước.
 */
export const TRANSIENT_KEYS = ['userId', 'username', 'lastSavedAt', 'data'] as const;

export function stripTransient(
  state: Record<string, any> | null | undefined,
): Record<string, any> {
  if (!state) return {};
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(state)) {
    if (!(TRANSIENT_KEYS as readonly string[]).includes(k)) out[k] = v;
  }
  return out;
}
