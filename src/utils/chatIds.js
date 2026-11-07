// A student or tutor can be referred to in chat_messages by either their row id
// or, for legacy rows, the login id stored in profile_id. Older messages may use
// either form, so every comparison must accept both.
export const personIds = (...people) => {
  const ids = new Set();
  for (const p of people) {
    if (!p) continue;
    if (typeof p === 'string' || typeof p === 'number') ids.add(String(p));
    else {
      if (p.id) ids.add(String(p.id));
      if (p.profile_id) ids.add(String(p.profile_id));
      // A contact that stands for several accounts (e.g. every admin, shown to students
      // as one "FoundaXia Admin" contact) lists the others in extra_ids.
      if (Array.isArray(p.extra_ids)) p.extra_ids.forEach(x => x != null && ids.add(String(x)));
    }
  }
  return ids;
};

export const isOneOf = (id, ids) => id != null && ids.has(String(id));

// True when message m is between the people identified by id sets a and b.
export const inThread = (m, a, b) =>
  (isOneOf(m.sender_id, a) && isOneOf(m.receiver_id, b)) ||
  (isOneOf(m.sender_id, b) && isOneOf(m.receiver_id, a));
