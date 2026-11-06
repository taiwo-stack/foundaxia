// Prefix a booking/registration message with the subject picked on the /subjects page.
export const withRequestedSubject = (subject, text) => {
  if (!subject) return text || null;
  return text ? `[Requested Subject: ${subject}]\n${text}` : `[Requested Subject: ${subject}]`;
};
