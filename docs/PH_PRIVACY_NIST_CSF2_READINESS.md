# Philippine privacy and NIST CSF 2.0 readiness checklist

> This is an engineering checklist, not legal advice, an audit report, or a certification. The operator must obtain advice from a Philippine privacy professional/legal counsel and verify the rules that apply to the actual operator, audience, data processing, and deployment before launch.

## 1. Philippine Data Privacy Act (RA 10173)

Nexus is expected to process personal data through accounts, emails, profile photos/banners, posts, messages metadata, engagement history, moderation reports, support tickets, security logs and feed personalization. Treat the operator as a potential Personal Information Controller (PIC) and vendors such as hosting/database/object storage providers as potential Personal Information Processors (PIPs), subject to the actual contracts and processing arrangements.

### Before public launch

- [ ] Replace every `[insert ...]` placeholder with the actual legal operator identity, service address and monitored privacy contact. Do not publish the site with placeholder privacy/DPO details.
- [ ] Appoint a competent DPO or determine the applicable designation requirement. Set up a monitored, role-protected privacy inbox and an escalation path.
- [ ] Inventory each category of data, purpose, lawful basis, recipients/processors, retention period, storage location and cross-border transfer. Do not assume consent is the sole lawful basis; document the correct basis for each processing purpose.
- [ ] Complete a privacy impact assessment (PIA/DPIA as applicable) for personalization/profiling, public media, private messages, moderation analytics and support records.
- [ ] Review whether the service's personalized feed constitutes profiling for purposes of NPC Circular No. 2022-04. The NPC states that processing systems involving automated decision-making or profiling must be registered in all instances. Determine the required NPC registration or exemption process; do not guess based on company size alone.
- [ ] Determine all other NPC Circular No. 2022-04 registration thresholds and file the required DPO/Data Processing System registrations or applicable sworn declaration/undertaking for exemption. The NPC currently identifies, among other cases, entities with at least 250 employees, processing sensitive personal information of at least 1,000 individuals, or processing that is likely to pose risk to rights and freedoms.
- [ ] Publish clear privacy notices before collecting data. Describe personalization inputs, content visibility, report evidence disclosure, B2/hosting processors, international transfers, security logs, retention and the real limits of E2EE.
- [ ] Test verified data-subject request handling: access/copy, rectification, objection, erasure/blocking, portability and withdrawal of consent when consent is the applicable basis. A ticket submission alone does not fulfill a request; the operator must triage, verify identity, action it within applicable rules and record a proportionate disposition.
- [ ] Document data retention/deletion schedules and exceptions for legal claims, moderation appeals, security investigations or other lawful retention. Make deletion operational across PostgreSQL, Backblaze B2, backups, caches and derived indexes where applicable.
- [ ] Keep a processor/vendor inventory and review contracts, access controls, security commitments, sub-processors, transfer locations, retention/deletion and breach-notification obligations.
- [ ] Define a personal-data breach procedure. Assess whether an incident meets the legal notification criteria and preserve a record of the decision. Where notification is required, the DPA IRR describes notification to the NPC and affected data subjects within 72 hours upon knowledge/reasonable belief of a notifiable breach; this is not a blanket rule that every security alert is reportable.
- [ ] Adopt community rules for non-consensual intimate imagery, doxxing, impersonation, threats, illegal content, copyright complaints and emergency escalation. Create proportionate content takedown, appeal, evidence preservation and lawful-request processes.
- [ ] Set an age policy and assess whether children's data or age-sensitive content could reasonably be processed. Add age-appropriate safeguards before targeting or knowingly serving children.

## 2. NIST Cybersecurity Framework (CSF) 2.0 mapping

CSF 2.0 is a voluntary risk-management framework, not a law or certification by itself. Its six concurrent functions are **Govern, Identify, Protect, Detect, Respond and Recover**.

| Function | Nexus controls to establish and verify |
|---|---|
| **Govern (GV)** | Named accountable owner; security/privacy policies; role separation; incident owner; vendor-risk review; change approval; moderation policy and appeal process; documented risk tolerance. |
| **Identify (ID)** | Asset/data inventory; data-flow diagrams for PostgreSQL, B2, auth, browser E2EE and logs; PIA; threat model; internet-exposed endpoint inventory; dependency/SBOM and vendor inventory. |
| **Protect (PR)** | TLS/HTTPS; secure cookies and session invalidation; least privilege; secret management; B2 bucket visibility appropriate to asset sensitivity (private storage for private data); upload size/type validation; rate limiting; CSRF/origin protections; dependency patching; secure backups; key-verification guidance; secure account recovery. |
| **Detect (DE)** | Centralized security/audit logs; alerting for credential stuffing, abuse, repeated reports, suspicious uploads and owner-role changes; upload scanning/moderation queue; database and storage monitoring; privacy incident reporting intake. |
| **Respond (RS)** | Written incident playbook; containment and credential/key rotation; decision record; evidence preservation; user communication; legal/DPO assessment; NPC notification decision path; abuse-report triage and appeal workflow. |
| **Recover (RC)** | Encrypted backups; tested restoration; recovery time/data-loss objectives; documented service restoration; post-incident review; revalidate access permissions after restore; communications and lessons learned. |

### Operational tests required before launch

- [ ] Enable HTTPS-only production, secure cookies, a strong auth secret, restrictive CORS, and appropriate CSP/security headers.
- [ ] Use unique least-privilege credentials for PostgreSQL, B2 and deployment; rotate secrets and never expose private B2 credentials to client-side variables.
- [ ] Run dependency and secret scans, static checks, unit/integration tests, and a security review against authorization boundaries; fix critical/high findings before public launch.
- [ ] Test ban/shadow-ban/role changes, blocks, private-community isolation and DM membership against direct API requests, not just UI navigation.
- [ ] Verify uploads by HEAD metadata after transfer; configure CORS on the configured B2 bucket(s), keeping private content in private buckets; add malware scanning/content moderation and lifecycle deletion before accepting public high-volume uploads.
- [ ] Exercise rate limits and abuse controls for sign-in, uploads, post creation, reports, support tickets, message sends and key registration.
- [ ] Prove backup restore and media-object restore, not merely that a backup file exists.
- [ ] Monitor availability, error rates, database pool pressure, feed projection lag and B2 access failures; define incident severity and on-call ownership.
- [ ] Conduct a penetration test and privacy/security review appropriate to the deployment's scale and risk.

## 3. E2EE and moderation boundaries

The current client encrypts DM message bodies before server storage. That does not hide every attribute: the service still processes account IDs, conversation membership, timing, message size and ciphertext. The web server also serves the JavaScript client, so a compromised server/deployment could deliver altered client code. Browser-local private keys can be lost; there is no audited multi-device key-recovery system in this version. This is encrypted, server-relayed messaging—not direct P2P networking. A user who submits a message report can intentionally disclose selected plaintext as evidence; moderators should only receive what is submitted and authorized by the reporting flow.

Before making strong security claims, commission independent cryptographic review, define multi-device/key-change recovery, test account/device compromise scenarios and document exactly what the service can and cannot see. Do not market this beta as anonymous or suitable for life-critical/high-risk secret communications.

## Authoritative references

- [Republic Act No. 10173 — Data Privacy Act of 2012 (National Privacy Commission)](https://privacy.gov.ph/data-privacy-act-/)
- [NPC — Rights of Data Subjects](https://privacy.gov.ph/data-subject-rights/)
- [NPC — Registration reminder and thresholds under Circular No. 2022-04](https://privacy.gov.ph/reminder-on-mandatory-data-protection-officer-and-data-processing-system-registration/)
- [NPC — Registration and compliance FAQs (updated January 5, 2026)](https://privacy.gov.ph/pips-and-pics/faqs/)
- [NPC — Implementing Rules and Regulations, data breach notification](https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/)
- [NIST Cybersecurity Framework 2.0](https://www.nist.gov/cyberframework)
