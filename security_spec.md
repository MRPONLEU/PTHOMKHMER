# Security Specification: primary-library (បណ្ណាល័យបឋម)

This security specification details the Zero-Trust data model, invariant conditions, and Red-Team payload test cases designed to protect public categories, downloadable file assets, and administrative access permissions on Google Cloud Firestore.

## 1. Data Invariants

1. **Admins Identity Integrity**: Administrative access requires explicit verification. Normal users cannot add or elevate themselves into administrative status. Only super administrators or existing validated administrators can add new records inside the `/admins/` collection.
2. **Category Isolation**: Anyone can view categories and sub-categories to explore the catalog, but only validated administrators can create, update or delete them.
3. **Document Access Rules**: 
   - Normal users can read and query all documents where `isHidden == false`.
   - Normal users are strictly forbidden from reading or querying documents where `isHidden == true`.
   - Only validated administrators have full modification/deletion access on `/docs/`.
   - Normal (unauthenticated) users can download files, which triggers a single action of incrementing the document's `downloads` field by exactly +1. No other fields can be bypassed or mutated during this action.

---

## 2. The "Dirty Dozen" Malicious Payloads

The following 12 payloads represent adversarial attempt variants designed to bypass authorization boundaries, poison resources, or escalate privileges:

1. **Self-Elevation Privilege Escalation**:
   - *Target*: `/admins/attacker@gmail.com`
   - *Payload*: `{ "email": "attacker@gmail.com", "addedAt": "2026-06-01T12:00:00Z" }`
   - *Result*: Should return `PERMISSION_DENIED` for non-admin users.

2. **Poison/Junk-Character Collection ID injection**:
   - *Target*: `/docs/$$$malicious_large_junk_id$$$`
   - *Payload*: `{ "title": "Injected Book", "downloadUrl": "https://attacker.space/virus.pdf", "uploadDate": "2026-06-01", "downloads": 0 }`
   - *Result*: Rejected via `isValidId()` rule.

3. **Modify Document Title without Admin Privilege**:
   - *Target*: `/docs/existing-doc-123`
   - *Payload*: Changing title to `"Hacked Document"`
   - *Result*: Rejected because only admins can modify `title`.

4. **Malicious Negative Download Mutation**:
   - *Target*: `/docs/existing-doc-123`
   - *Payload*: Changing downloads counter from `100` to `0` or negative.
   - *Result*: Rejected because `downloads` must increase by exactly 1 for non-admins.

5. **Exposing Hidden System Docs via List (Scraping)**:
   - *Query*: Listing all documents
   - *Constraint*: Attempting to fetch documents where `isHidden == true` as an unauthenticated attacker.
   - *Result*: Query rejected by rule boundary checking `resource.data.isHidden == false`.

6. **Spoofing Super Admin Identity via JWT Email claim without Verification**:
   - *Auth Details*: Attacker sets `email = 'broponleu998@gmail.com'` but with `email_verified = false`.
   - *Result*: Rejected because any administrative checks require verified emails (`email_verified == true`).

7. **Injecting 10MB String into Category Title**:
   - *Target*: `/categories/cat-123`
   - *Payload*: `{ "name": "[10MB string...]", "subTypes": [] }`
   - *Result*: Blocked by `isValidCategory` checking `.size() <= 200`.

8. **Orphan Category Creation**:
   - *Target*: `/categories/invalid-id`
   - *Payload*: Creating a category with empty ID or non-matching specifications.
   - *Result*: Blocked by schema validation rules.

9. **Injecting Multi-user Collaboration State Shortcutting**:
   - *Target*: Hijacking another user's download log.
   - *Result*: Disallowed by Zero-Trust checks.

10. **Shadow Key Field Insertion during Doc Creation**:
    - *Target*: `/docs/new-doc-xyz`
    - *Payload*: `{ "title": "Title", "downloadUrl": "http://..", "downloads": 0, "uploadDate": "2026-x", "ghostField": "malicious" }`
    - *Result*: Rejected by `isValidDoc` exact key matching constraints.

11. **Bypassing Document Immutability (createdAt)**:
    - *Target*: Attempting to mutate a document's historical creation timestamps.
    - *Result*: Blocked.

12. **PII Blanket Scanning Attempt**:
    - *Target*: Reading admin secrets collection.
    - *Result*: Blocked; only authenticated users may do single lookups or list them safely.

---

## 3. The Test Runner Spec

We describe the test assertions verifying all secure boundaries in `DRAFT_firestore.rules` and output the final production rules model in `firestore.rules`.
