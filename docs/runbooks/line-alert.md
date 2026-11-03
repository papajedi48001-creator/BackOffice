# การแจ้งเตือน LINE

เมื่อมีงานรอหัวหน้าหรือผู้จัดการ (มีคำขอรอพิจารณา, มีการจองห้องรออนุมัติ, มียอดยกมารอรับรอง, มีใบขอใช้รถรอจัดรถ) ระบบส่งข้อความเข้ากลุ่ม LINE ของโมดูลนั้น และ @ชื่อคนที่ต้องทำ:

```
@สมชาย [จองห้องประชุม] มีคำขอใหม่ 1 รายการ
https://192.168.1.20:8443/rooms/bookings/…
```

ข้อความไม่มีชื่อผู้ยื่น เหตุผล หรือรายละเอียดคำขอ ลิงก์เปิดได้เฉพาะในเครือข่ายโรงพยาบาล และหน้าปลายทางตรวจสิทธิ์เอง ชื่อหลัง @ เป็นชื่อที่เจ้าตัวตั้งใน LINE

ออกแบบไว้ที่ `docs/superpowers/specs/2026-11-03-line-alert-design.md`

## 1. สร้าง LINE Official Account และ Messaging API (ทำครั้งเดียว)

1. สร้างบัญชีที่ <https://manager.line.biz> (LINE Official Account Manager) เช่น "Back Office รพ.วาริชภูมิ"
2. ใน **ตั้งค่า > Messaging API** กด **ใช้ Messaging API** แล้วเลือกหรือสร้าง Provider
3. ใน **ตั้งค่า > การตอบกลับ** ปิด **ข้อความทักทายเพื่อนใหม่** และเลือก **แชทแบบแมนนวล** (ไม่มีข้อความตอบกลับอัตโนมัติ) ช่อง **Webhook** จะเปิดได้หลังใส่ Webhook URL ในข้อ 3
4. ใน **ตั้งค่า > บัญชี** เปิด **อนุญาตให้บัญชีเข้าร่วมกลุ่มแชทได้**
5. เปิด <https://developers.line.biz/console/> เลือก channel เดียวกัน
   - แท็บ **Basic settings**: คัดลอก **Channel secret**
   - แท็บ **Messaging API**: คัดลอก **Bot basic ID** (เช่น `@123abcd`) แล้วกด **Issue** ที่ **Channel access token (long-lived)** และคัดลอกไว้
6. แผนฟรีส่งได้จำนวนจำกัดต่อเดือน และการส่งเข้ากลุ่มนับตามจำนวนสมาชิกในกลุ่ม ดูราคาและโควตาปัจจุบันใน LINE Official Account Manager

## 2. ใส่ค่าในเครื่องที่รันระบบ

เพิ่มบรรทัดเหล่านี้ใน `.env` ที่ราก repo (ไฟล์ที่ `node scripts/setup-local.mjs` สร้าง):

```
LINE_CHANNEL_ACCESS_TOKEN=<Channel access token>
LINE_CHANNEL_SECRET=<Channel secret>
LINE_BOT_BASIC_ID=@123abcd
BACKOFFICE_PUBLIC_URL=https://192.168.1.20:8443
```

`BACKOFFICE_PUBLIC_URL` คือ URL ที่บุคลากรเปิดระบบใน LAN ใช้ทำลิงก์ในข้อความ ไม่ต้องเป็น URL สาธารณะ

บนเซิร์ฟเวอร์จริงให้เก็บ token และ secret เป็นไฟล์ secret แล้วตั้ง `LINE_CHANNEL_ACCESS_TOKEN_FILE` และ `LINE_CHANNEL_SECRET_FILE` แทน ห้ามใส่ค่าในเอกสาร แชต หรือ log

แล้วเปิดเว็บและ worker ใหม่ (`node scripts/setup-local.mjs web`) หน้า **ผู้ดูแลระบบ > ตั้งค่าการเชื่อมต่อ** แถว **LINE (แจ้งเตือน)** ต้องขึ้น "ตั้งค่าแล้ว" และ "ปกติ"

ไม่ใส่ `LINE_CHANNEL_ACCESS_TOKEN` = ระบบทำงานตามเดิม แค่ไม่ส่ง LINE

## 3. เปิด webhook ให้ LINE เรียกเข้ามา

LINE ต้องเรียก `https://<โดเมนสาธารณะ>/api/line/webhook` ด้วยใบรับรอง HTTPS ที่เชื่อถือได้ (ใบรับรองของ CA ภายในที่ใช้ใน LAN ใช้ไม่ได้) เลือกทางใดทางหนึ่ง

### 3A. NAT ตรง (มีโดเมนและ public IP ของโรงพยาบาลแล้ว)

ใช้เมื่อมีโดเมน เช่น `notify-waritch-hosp.moph.go.th` ชี้ไป public IP ของโรงพยาบาล

1. งานเครือข่ายตั้ง NAT/port forward ที่ firewall: public IP พอร์ต TCP **443** และ **80** ไปที่เครื่องที่รันระบบ พอร์ตเดียวกัน (80 ใช้ขอใบรับรอง ถ้าเปิดได้แค่ 443 Caddy ก็ขอผ่าน 443 ได้)
2. อนุญาตพอร์ตใน Windows firewall (PowerShell แบบ Administrator):

   ```powershell
   New-NetFirewallRule -DisplayName "BackOffice LINE webhook" -Direction Inbound -Protocol TCP -LocalPort 80,443 -Action Allow -Profile Any
   ```

   `-Profile Any` เพราะการ์ดแลนของเครื่องอาจถูกตั้งเป็นเครือข่ายแบบ Public ซึ่งกฎแบบ Private ไม่ครอบคลุม

   ถ้าเครื่องนี้มีระบบอื่นใช้พอร์ต 80 หรือ 443 อยู่แล้ว (ตรวจด้วย `netstat -ano | findstr LISTENING | findstr ":80 :443"`) ให้เลือกพอร์ตอื่น เช่น 8081 และ 8444 ตั้ง NAT ให้ public 80 → 8081 และ public 443 → 8444 ใส่ `LINE_WEBHOOK_HTTP_PORT=8081` และ `LINE_WEBHOOK_HTTPS_PORT=8444` ใน `.env` และเปิด firewall ที่ `-LocalPort 8081,8444` แทน ภายนอกยังเรียกด้วย `https://<โดเมน>/` พอร์ต 443 ตามปกติ

3. เพิ่มใน `.env`: `LINE_WEBHOOK_HOST=notify-waritch-hosp.moph.go.th` และตรวจว่า `BACKOFFICE_WEB_PORT` ตรงกับพอร์ตที่เว็บรันจริง
4. รัน `node scripts/setup-local.mjs line-webhook` Caddy จะขอใบรับรอง Let's Encrypt เอง และส่งต่อเฉพาะ `POST /api/line/webhook` ไปที่เว็บ เส้นทางอื่นทั้งหมดตอบ 404 คนนอกจึงเปิดหน้าระบบไม่ได้ หน้าเว็บใน LAN (`:8443`) ไม่เปลี่ยน
5. ตรวจ: เปิด `https://<โดเมน>/` จากมือถือที่ปิด Wi-Fi ต้องได้ 404 พร้อมใบรับรองที่ถูกต้อง ดู log ด้วย `docker compose -f infra/compose/docker-compose.dev.yml logs line-webhook`
6. ใน LINE Developers ใส่ **Webhook URL** = `https://<โดเมน>/api/line/webhook` กด **Verify** แล้วเปิด **Use webhook** จากนั้นช่อง **Webhook** ในหน้าตั้งค่าการตอบกลับของ OA จะเปิดได้

### 3B. Cloudflare Tunnel (มีโดเมนใน Cloudflare แต่ไม่มี NAT)

LINE ต้องเรียก `https://<โดเมนสาธารณะ>/api/line/webhook` เพื่อบอกว่าบอทถูกเชิญเข้ากลุ่มไหน และเพื่อรับรหัสเชื่อมต่อจากบุคลากร ใช้ Cloudflare Tunnel เปิดเฉพาะเส้นทางนี้โดยไม่ต้องเปิดพอร์ตขาเข้า เส้นทางนี้รับเฉพาะข้อความที่ LINE ลงลายเซ็นด้วย Channel secret

ต้องมีบัญชี Cloudflare และโดเมนที่จัดการใน Cloudflare

1. ติดตั้ง `cloudflared` บนเครื่องที่รันระบบ (Windows: `winget install --id Cloudflare.cloudflared`)
2. `cloudflared tunnel login`
3. `cloudflared tunnel create backoffice-line`
4. `cloudflared tunnel route dns backoffice-line line.<โดเมนของคุณ>`
5. สร้าง `%USERPROFILE%\.cloudflared\config.yml` ที่ส่งต่อเฉพาะ webhook และปฏิเสธทุกเส้นทางอื่น:

   ```yaml
   tunnel: backoffice-line
   credentials-file: C:\Users\<ชื่อผู้ใช้>\.cloudflared\<tunnel-id>.json
   ingress:
     - hostname: line.<โดเมนของคุณ>
       path: ^/api/line/webhook$
       service: http://localhost:<BACKOFFICE_WEB_PORT>
     - service: http_status:404
   ```

6. ทดสอบด้วย `cloudflared tunnel run backoffice-line` แล้วติดตั้งเป็น service: `cloudflared service install`
7. ใน LINE Developers แท็บ **Messaging API** ใส่ **Webhook URL** = `https://line.<โดเมนของคุณ>/api/line/webhook` กด **Verify** ต้องขึ้น Success และเปิด **Use webhook**

ห้ามใช้ quick tunnel (`cloudflared tunnel --url …`) กับระบบจริง เพราะเปิดทั้งเว็บออกอินเทอร์เน็ตและ URL เปลี่ยนทุกครั้งที่รัน

## 4. ตั้งกลุ่มของแต่ละโมดูล (ผู้ดูแลระบบ)

1. สร้างกลุ่ม LINE ของหัวหน้าหรือผู้จัดการ เช่น "หัวหน้างาน รพ." หรือใช้กลุ่มเดิม แล้วเชิญบอทเข้ากลุ่ม
2. เปิด **ผู้ดูแลระบบ > แจ้งเตือน LINE** กลุ่มจะขึ้นในตาราง **กลุ่ม LINE** เอง (ที่มา "เชิญบอทเข้ากลุ่ม")
   - ถ้าไม่ขึ้น (webhook ยังไม่ทำงาน) กด **เพิ่มกลุ่มเอง** แล้ววางรหัสกลุ่ม (`C` ตามด้วย 32 ตัวอักษร)
3. กด **ส่งข้อความทดสอบ** ที่กลุ่ม ต้องเห็นข้อความ "ทดสอบการแจ้งเตือนจาก Back Office" ในกลุ่ม
4. ในตาราง **กลุ่มแจ้งเตือนของโมดูล** กด **แก้ไข** ที่โมดูล แล้วเลือกกลุ่ม หลายโมดูลใช้กลุ่มเดียวกันได้ เลือก "ไม่ส่ง LINE" เพื่อปิด

ทุกการเปลี่ยนแปลงถูกบันทึกในบันทึกการตรวจสอบ (`line.group.*`, `line.route.changed`)

## 5. บุคลากรเชื่อมต่อ LINE (หัวหน้า ผู้จัดการ ทุกคนที่อยากถูก @)

1. เปิด **ข้อมูลส่วนตัวของฉัน** (เมนูชื่อมุมขวาบน) กด **เชื่อมต่อ LINE**
2. กด **สร้างรหัสเชื่อมต่อ** จะได้รหัส 8 ตัว เช่น `ABCD-2345` ใช้ได้ 10 นาที
3. กด **เพิ่มบอทของโรงพยาบาลเป็นเพื่อน** แล้วส่งรหัสในแชตส่วนตัวกับบอท (พิมพ์ในกลุ่มระบบจะไม่อ่าน)
4. บอทตอบ "เชื่อมต่อบัญชี LINE กับ Back Office แล้ว" กด **ตรวจสอบอีกครั้ง** ในระบบ จะขึ้น "เชื่อมต่อแล้ว"
5. ต้องเป็นสมาชิกกลุ่ม LINE ของโมดูลด้วย จึงจะได้รับการแจ้งเตือนจาก @ชื่อ

ยกเลิกได้ที่ปุ่มเดียวกัน (**ยกเลิกการเชื่อมต่อ**) หรือบล็อกบอทใน LINE ระบบจะยกเลิกการเชื่อมต่อให้เอง ถ้าใช้ LINE บัญชีเดียวกันเชื่อมต่อกับอีกคน บัญชีจะย้ายไปคนล่าสุด

## ปัญหาที่พบบ่อย

| อาการ | สาเหตุและวิธีแก้ |
|---|---|
| Verify webhook ไม่ผ่าน | tunnel ไม่ทำงาน, path ใน `config.yml` ไม่ตรง, หรือเว็บยังไม่ได้ตั้ง `LINE_CHANNEL_SECRET` (ตอบ 503) |
| บอทตอบ "รหัสไม่ถูกต้องหรือหมดอายุ" | รหัสเกิน 10 นาทีหรือใช้ไปแล้ว ให้สร้างรหัสใหม่ |
| บอทไม่ตอบอะไรเลย | webhook ไม่ถึงระบบ หรือยังเปิดข้อความตอบกลับอัตโนมัติของ OA อยู่ |
| ไม่มีข้อความเข้ากลุ่ม | โมดูลยังไม่ได้เลือกกลุ่ม, ผู้รับยังไม่เชื่อมต่อ LINE, บอทถูกเตะออกจากกลุ่ม, หรือ worker ไม่ได้รัน |
| มีข้อความแต่ไม่ขึ้นแจ้งเตือน @ | ผู้รับไม่ได้อยู่ในกลุ่มนั้น |
| ส่งข้อความทดสอบแล้วขึ้น "LINE ไม่รับข้อความ" | token ผิดหรือหมดอายุ บอทไม่อยู่ในกลุ่ม หรือโควตาเดือนนี้หมด |
| worker log `LINE_PUSH_FAILED` | LINE ปฏิเสธ (โควตา, token) ระบบลองใหม่ตามรอบของ outbox แล้วหยุดที่ dead-letter |
