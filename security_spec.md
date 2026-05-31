# Firebase Security Specification - MUHASEBE (DAL ALÜMİNYUM AKSESUAR)

## 1. Data Invariants
1. **User Role Invariant**: Every User Profile (`/users/{userId}`) must have a `role` field that is strictly `"admin"` or `"customer"`. Users cannot modify their own roles (locked to prevent self-privilege escalation).
2. **Identity Match Invariant**: For all standard collections, a customer can only read or write their own documents (e.g. `/files/{fileId}`, `/orders/{orderId}`). Only an `"admin"` can read or write across all documents.
3. **No Phantom Products**: Product IDs used in Orders or Invoices should match physical products, and price/unit levels should be validated.
4. **Finite Boundaries**: All IDs, titles, notes, and strings must have strict `.size() <= MAX` bounds to resist memory and billing exhausts.
5. **Timeline Integrity**: Timestamps (`createdAt`, `updatedAt`) must rely on `request.time` server variables rather than client payloads.

## 2. The "Dirty Dozen" Payloads
Below are 12 specific payloads attempting to violate security invariants, all of which should return `PERMISSION_DENIED`:

### P1: Privilege Escalation - Self Admin Assignment
Attempting to create/update a user profile with `role: "admin"` as a standard customer.
```json
{
  "uid": "victim_user_123",
  "email": "malicious@attacker.com",
  "role": "admin",
  "companyName": "Attacker Inc.",
  "createdAt": "2026-05-31T09:00:00Z"
}
```

### P2: Identity Spoofing - Creating Document under another UID
Attempting to create an order claiming to be another user.
```json
{
  "id": "order_666",
  "customerId": "innocent_victim_uid",
  "customerName": "Victim",
  "items": [],
  "status": "pending",
  "totalAmount": 100,
  "createdAt": "2026-05-31T09:00:00Z"
}
```

### P3: Denial of Wallet - Unbounded Document ID Range
Attempting to inject a massive 2KB string as a Firestore document ID to cause key storage overflow.
```
ID: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA... [2KB long string]"
```

### P4: Value Poisoning - Negative Product Price
Creating a product with a negative price values.
```json
{
  "id": "prod_1",
  "name": "Alüminyum Aksesuar",
  "dimension": "10x20",
  "unit": "Adet",
  "price": -100,
  "stockLevel": 10
}
```

### P5: State Shortcutting - Customer Overriding Order Status to "Completed"
Customer attempts to skip order processing and marks order as complete directly on creation.
```json
{
  "id": "order_777",
  "customerId": "attacker_uid",
  "customerName": "Attacker",
  "items": [],
  "status": "completed",
  "totalAmount": 100,
  "createdAt": "2026-05-31T09:00:00Z"
}
```

### P6: System Bypass - Direct Invoice Creation by Customer
A standard customer attempting to inject an invoice document in the `/invoices` collection.
```json
{
  "id": "invoice_888",
  "invoiceNumber": "F-20260001",
  "customerId": "attacker_uid",
  "customerTitle": "Attacker Co.",
  "date": "2026-05-31",
  "items": [],
  "subtotal": 0,
  "taxTotal": 0,
  "grandTotal": 0,
  "status": "paid"
}
```

### P7: Ghost Field Injection - Appending Unregistered Metadata
Attempting to update a product with an unlisted field `isSponsored: true` to hijack search indexes.
```json
{
  "id": "prod_999",
  "name": "Alüminyum",
  "isSponsored": true
}
```

### P8: Time-travel Exploits - Spoofing `createdAt` Date in the Past
Injecting `createdAt` value matching years ago instead of using the native server timestamp variable.
```json
{
  "id": "order_999",
  "customerId": "user_12",
  "createdAt": "2010-01-01T00:00:00Z"
}
```

### P9: PII Extraction - Reading other user private profile data
A standard customer attempting to do a read or list on `/users` collection without direct ownership filters.
```
GET /users/victim_user_abc
```

### P10: Terminal State Modification - Modifying Post-Paid Invoice
Attempting to edit details or amounts of an invoice that is already finalized with status `paid`.
```json
{
  "grandTotal": 0
}
```

### P11: Relational Orphan - Creating child Order referencing non-existent Customer Account
Adding an order that reference a random customer ID not found in the DB.
```json
{
  "customerId": "phantom_customer"
}
```

### P12: File Metadata Hijacking - Creating UploadedFile record for foreign download sources
Attempting to create an uploaded file referencing external untrusted HTTP URLs.
```json
{
  "id": "file_99",
  "userEmail": "victim@domain.com",
  "fileName": "unregulated.exe",
  "downloadUrl": "https://malicious-file-server.com/malware.exe"
}
```

## 3. Test Runner Outline (firestore.rules.test.ts)
A test suite (such as `@firebase/rules-unit-testing`) must be run to assert:
- `assertFails(aliceDb.collection('users').doc('bob').set({ role: 'admin' }))`
- `assertSucceeds(aliceDb.collection('users').doc('alice').set({ role: 'customer' }))`
- `assertFails(aliceDb.collection('products').add({ price: -5 }))`
- `assertFails(aliceDb.collection('invoices').doc('inv_1').update({ grandTotal: 99999 }))` (post-payment verification locking)
