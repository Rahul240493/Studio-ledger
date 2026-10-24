import "./settings";

// Display names for partners (their sign-in comes from PARTNER_EMAILS).
const PARTNER_NAMES = {
  "rahulreddy2493@gmail.com": "Rahul Reddy",
  "harshith.potluri.9@gmail.com": "Harshith Potluri",
  "varunvadlapatla7@gmail.com": "Varun Vadlapatla",
  "praneethmargam@gmail.com": "Praneeth Margam",
  "cinematographer.ssmanoj@gmail.com": "SS Manoj",
};
export const partnerEmails = () => (process.env.PARTNER_EMAILS || "").split(/[,\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);

// Everyone who can be assigned work: partners plus employees on the Team tab.
// Team-tab rows can also hold a partner's job title and group (their access still comes from PARTNER_EMAILS).
export function membersFrom(teamRows) {
  const rows = new Map((teamRows || []).map((r) => [String(r.email).toLowerCase(), r]));
  const partners = partnerEmails().map((email) => {
    const r = rows.get(email) || {};
    return { email, name: r.name || PARTNER_NAMES[email] || email.split("@")[0], title: r.title || "Partner", group: r.group || "Partners", partner: true };
  });
  const pset = new Set(partners.map((p) => p.email));
  const staff = [...rows.values()].filter((r) => !pset.has(String(r.email).toLowerCase())).map((r) => ({
    email: String(r.email).toLowerCase(), name: r.name || String(r.email).split("@")[0], title: r.title || "", group: r.group || "Creative and production", partner: false,
  }));
  return [...partners, ...staff];
}
