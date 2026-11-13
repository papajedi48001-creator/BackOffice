# ไปราชการ: หนังสือเชิญ, combined flight vehicles, budget source per item — design

## Behaviour
1. **หนังสือเชิญ.** The form has three optional fields: เลขที่หนังสือเชิญ (≤ 100 characters), วันที่หนังสือเชิญ (a date) and หน่วยงานที่ออกหนังสือ (≤ 300 characters). The detail and print pages show them when they are filled in.
2. **พาหนะ.** Two new vehicle options: รถส่วนตัว + เครื่องบิน (`PRIVATE_CAR_AIRPLANE`) and รถราชการ + เครื่องบิน (`GOVERNMENT_CAR_AIRPLANE`). `usesGovernmentCar(vehicle)` is true for GOVERNMENT_CAR and GOVERNMENT_CAR_AIRPLANE, so requesting a car from ยานพาหนะ works for both.
3. **งบประมาณ.** Each cost item has its own amount and its own แหล่งงบประมาณ. The items are เบี้ยเลี้ยง, ค่าที่พัก, ค่าพาหนะ and ค่าลงทะเบียน. The single แหล่งงบประมาณ select for the whole estimate is removed.
   - The input carries `costFunding { allowance, lodging, transport, registration }`.
   - `fundingSource` is optional. The server stores a summary in `funding_source`: the shared source when every item with an amount uses the same source, `NONE` when no item has an amount, and `MIXED` (หลายแหล่ง) otherwise.
   - Older trips have no per-item source, so each item falls back to the trip's `funding_source`.

## Data
- Migration `0039_travel_invitation_funding.sql` adds the nullable columns `invitation_number`, `invitation_date`, `invitation_issuer`, `funding_allowance`, `funding_lodging`, `funding_transport` and `funding_registration`.
