# La ERP de InnVolt en Oracle Cloud (gratis)

La ERP deja Supabase (EE. UU.) y Netlify y pasa a un servidor propio en **Oracle Cloud, región
Santiago**, en el plan **Always Free**: US$ 0 al mes. Es la misma ERP, con las mismas pantallas, la
misma base (PostgreSQL) y el mismo login. Cambia dónde corre.

- **Más rápida.** Cada consulta a Supabase tarda hoy unos 0,2 a 0,5 s. El viaje a Oracle Santiago es
  de unos 0,04 s, y la app y la base quedan en la misma máquina.
- **Sin los límites del plan gratuito de Supabase.** Hay 12 GB de RAM para la base y hasta 150 GB de disco.

## InnVolt y VSX: siempre separados

InnVolt es la empresa y VSX será un cliente: comparten la cuenta de Oracle (`cecastrosuazo`), pero
nada más.

| | InnVolt (esta guía) | VSX (no se toca) |
|---|---|---|
| Compartimento | `innvolt` | el suyo (hoy la raíz; se puede mover a `vsx`) |
| Red | `innvolt-vcn` | la suya |
| Servidor | `innvolt-erp` · Ampere A1, 2 OCPU, 12 GB | `VM.Standard.E2.1.Micro` |
| Respaldos | bucket `innvolt-respaldos` | el suyo |
| Vigía | usuario `vigia-innvolt` (solo su compartimento), en `Inn-Volt/erp` | `vigia-github`, en su repositorio |

Si VSX pasa a la cuenta de Oracle del cliente, se lleva lo suyo y InnVolt sigue igual.

---

## 1. En la consola de Oracle (una vez)

### 1.1 Compartimento `innvolt`
☰ → **Identity & Security → Compartments → Create compartment**: nombre `innvolt`, descripción
«ERP de InnVolt». Todo lo que sigue se crea **dentro de `innvolt`**: está en el selector
*Compartment* de cada pantalla.

### 1.2 Red `innvolt-vcn`
☰ → **Networking → Virtual cloud networks → Start VCN Wizard → Create VCN with Internet
Connectivity**: nombre `innvolt-vcn`, compartimento `innvolt`, el resto por omisión.

Luego, en la red → **Security Lists → Default Security List for innvolt-vcn → Add Ingress Rules**:

| Source CIDR | IP Protocol | Destination Port Range |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

### 1.3 Servidor `innvolt-erp`
☰ → **Compute → Instances → Create instance** (compartimento `innvolt`):

| Campo | Valor |
|---|---|
| Name | `innvolt-erp` |
| Image | **Canonical Ubuntu 24.04** |
| Shape | *Change shape* → **Ampere → VM.Standard.A1.Flex** → **2 OCPU y 12 GB**. Debe decir *Always Free-eligible* |
| Networking | `innvolt-vcn`, subred pública, **Assign a public IPv4 address: Sí** |
| SSH keys | **Generate a key pair for me → Save private key** (guárdala: sin ella no se entra) |
| Boot volume | *Specify a custom size* → **100 GB** (VSX usa ~50 de los 200 GB gratis) |

- **Si sale «Out of capacity»** (pasa con Ampere en Santiago): reintenta más tarde o al día
  siguiente. También puedes crearla con 1 OCPU y 6 GB y agrandarla después (*Edit → Shape*).
- **Anota la IP pública.** Se mantiene mientras exista la instancia, aunque se apague.

### 1.4 La dirección
- **Para probar:** `IP-CON-GUIONES.sslip.io`. Por ejemplo, con la IP `152.67.10.20` es
  `152-67-10-20.sslip.io`. Funciona sin configurar nada.
- **Definitiva:** un registro `A` en el DNS de innvolt.cl, por ejemplo `erp` → la IP del servidor.
  Si es una dirección que hoy nadie usa, conviene ensayar directo en ella. Si es la misma que hoy
  usa la ERP en Netlify, se ensaya con `sslip.io` y se cambia el día del cambio
  (`cambiar-direccion.sh`, sección 5).

## 2. Preparar el servidor (unos 15 minutos)

Desde la carpeta del repositorio, en PowerShell. Si la clave «es demasiado abierta», primero:
`icacls "C:\ruta\clave.key" /inheritance:r /grant:r "$($env:USERNAME):R"`.

```powershell
scp -i "C:\ruta\clave.key" ops/oracle/preparar-servidor.sh ubuntu@IP:/tmp/
ssh -i "C:\ruta\clave.key" -t ubuntu@IP "sudo bash /tmp/preparar-servidor.sh erp.innvolt.cl"
```

(o la dirección `sslip.io`). El script:
1. Instala Docker, la swap, el firewall y las actualizaciones de seguridad automáticas.
2. Crea el usuario `innvolt`.
3. Muestra una **clave de solo lectura**: agrégala en GitHub → `Inn-Volt/erp` → *Settings → Deploy
   keys* sin «Allow write access».
4. Genera las claves del servidor en `ops/oracle/.env` (solo quedan en el servidor).
5. Crea la base con todas las fases SQL de siempre y programa el respaldo diario.

## 3. Completar las claves de Netlify y levantar la ERP

Copia desde Netlify (*Site configuration → Environment variables*) lo que pide `ops/oracle/.env`:
avisos (VAPID, PUSH_SECRET), correo (Resend), IA y Google Sheet. Las de Supabase **no**: el servidor
tiene las suyas.

Para «Olvidé mi contraseña» completa también `SMTP_*`. Con Resend es la misma clave:
`SMTP_HOST=smtp.resend.com`, `SMTP_USUARIO=resend`, `SMTP_CLAVE=` (la `RESEND_API_KEY`) y
`SMTP_REMITENTE=` (el mismo correo de `CORREO_REMITENTE`). Sin esto, la ERP funciona igual y la
contraseña se puede reponer con el enlace que genera **Usuarios**.

```bash
sudo -u innvolt nano /opt/innvolt/erp/ops/oracle/.env
sudo -u innvolt bash /opt/innvolt/erp/ops/oracle/actualizar.sh      # la primera vez tarda ~10 minutos
```

## 4. Traer los datos de Supabase

```bash
sudo -u innvolt bash /opt/innvolt/erp/ops/oracle/migrar-desde-supabase.sh
```

Pide al comienzo, sin guardarlos:
- la conexión de la base: **Supabase → Connect → Session pooler**;
- la **URL del proyecto** y la **service_role key** (*Project Settings → API*).

Copia todas las tablas, las cuentas con sus mismas contraseñas y los archivos, y deja apuntando a este
servidor lo que en los datos apuntaba a Supabase o a Netlify (el logo de cada empresa y la dirección
de los avisos al celular). Supabase no se toca: queda de respaldo. Se puede repetir: cada vez
reemplaza todo por lo que haya en Supabase en ese momento.

**Primero un ensayo** (con la dirección `sslip.io`, mientras el equipo sigue en la ERP de siempre):
1. Entra con tu correo y tu misma contraseña.
2. Revisa una cotización, su PDF (con el logo), una boleta, la campanita y un aviso al celular.
3. Lo que se haga en el ensayo se pierde el día del cambio: es solo para probar.

## 5. El cambio definitivo (unos 30 minutos, fuera del horario de trabajo)
1. Avisa al equipo que no use la ERP durante ese rato.
2. Vuelve a correr `migrar-desde-supabase.sh`: trae los datos de ese momento.
3. La dirección:
   - **Si el ensayo ya fue en la dirección definitiva** (una nueva, como `erp.innvolt.cl`, que nadie
     usaba): no hay nada más que cambiar.
   - **Si el ensayo fue con `sslip.io`:** apunta el DNS de la dirección definitiva a la IP de Oracle y
     después corre `sudo -u innvolt bash /opt/innvolt/erp/ops/oracle/cambiar-direccion.sh erp.innvolt.cl`
     (cambia la dirección sin tocar claves ni datos y saca el certificado). Si esa dirección hoy la
     usa Netlify, baja el TTL del registro a 5 minutos el día anterior, para que el cambio se note rápido.
4. Todos vuelven a iniciar sesión. Si la dirección es distinta a la de antes, cada persona instala la
   app de nuevo en el celular y activa los avisos (una vez). Con la misma dirección, no hace falta.
5. En Netlify, apaga los despliegues automáticos (*Build settings → Stop builds*).
6. Durante 2 a 4 semanas deja Supabase como estaba: para volver atrás basta con usar de nuevo la
   dirección de Netlify (lo hecho en Oracle mientras tanto no vuelve solo). Luego se puede pausar o borrar.

## 6. Respaldos fuera del servidor (gratis)
El cron ya guarda cada día, a las 03:30, los datos y los archivos (7 días en el servidor). Para tener
también una copia fuera:
1. ☰ → **Storage → Buckets** (compartimento `innvolt`) → *Create bucket* `innvolt-respaldos`.
2. En el bucket: **Lifecycle Policy Rules** → borrar objetos de más de **30 días**.
3. **Pre-Authenticated Requests → Create**: *Permit object writes*, expiración lejana. Copia la URL
   (termina en `/o/`) en `RESPALDO_PAR_URL` de `ops/oracle/.env`.

Restaurar (aquí o en un servidor nuevo, después de `preparar-servidor.sh`):
`bash ops/oracle/restaurar.sh ops/oracle/respaldos/innvolt-FECHA-datos.tgz [innvolt-FECHA-archivos.tgz]`.

## 7. Vigía (Oracle apaga los servidores gratis que pasan 7 días sin uso)
Con la base usando más del 20 % de la memoria, lo normal es que no pase. El vigía es la red de
seguridad: un usuario que **solo puede ver y encender** el servidor de InnVolt.
1. **Identity → Domains → Default → Groups → Create**: `vigias-innvolt`.
2. **Users → Create**: `vigia-innvolt`, agregarlo al grupo. En el usuario, **API keys → Add API key**
   (generar el par): guarda la clave privada y anota la *fingerprint*.
3. **Policies** (compartimento **raíz**) → *Create policy* `vigia-innvolt`:
   ```
   Allow group vigias-innvolt to read instances in compartment innvolt
   Allow group vigias-innvolt to use instances in compartment innvolt
   ```
4. En GitHub → `Inn-Volt/erp` → *Settings → Secrets and variables → Actions*:
   - secreto `OCI_VIGIA_CLAVE` (la clave privada);
   - variables `OCI_VIGIA_USUARIO` (OCID del usuario), `OCI_VIGIA_HUELLA`, `OCI_TENANCY` (OCID de la
     cuenta), `OCI_REGION` (`sa-santiago-1`), `OCI_INSTANCIA` (OCID de `innvolt-erp`) y `URL_ERP`.
5. *Actions → Vigía del servidor (Oracle) → Run workflow* con «Comprobar que puede encender».

## 8. El día a día
- **Después de cada cambio:** `sudo -u innvolt bash /opt/innvolt/erp/ops/oracle/actualizar.sh`.
- **Un SQL nuevo** (lo que antes era pegarlo en Supabase):
  `sudo -u innvolt bash /opt/innvolt/erp/ops/oracle/migraciones.sh supabase_faseNN_x.sql`.
- **Cambiar la dirección de la ERP:**
  `sudo -u innvolt bash /opt/innvolt/erp/ops/oracle/cambiar-direccion.sh nueva.innvolt.cl`
  (con el DNS de la nueva ya apuntando al servidor).
- **Ver qué pasa:** `cd /opt/innvolt/erp && sudo -u innvolt docker compose -f ops/oracle/docker-compose.yml --env-file ops/oracle/.env logs -f app`.
- **Ver la base con DBeaver o pgAdmin:** túnel SSH
  `ssh -i clave.key -L 5432:127.0.0.1:5432 ubuntu@IP` y conectar a `localhost:5432`, usuario
  `postgres`, con la clave `POSTGRES_PASSWORD` del `.env`.

---

## Costos

### Hoy: US$ 0
Todo lo de InnVolt es *Always Free*:

| Recurso | Gratis por cuenta | InnVolt | VSX |
|---|---|---|---|
| Ampere A1 | 2 OCPU y 12 GB | **todo** (2 OCPU, 12 GB) | — |
| AMD Micro | 2 instancias | — | 1 |
| Disco | 200 GB | 100 GB | ~50 GB |
| Object Storage | 20 GB | respaldos (pocos GB) | sus respaldos |
| Tráfico de salida | 10 TB al mes | muy poco | muy poco |

Para que siga en $0:
- **No presionar «Upgrade your account»** (pasar a *Pay As You Go*).
- Crear solo lo que dice *Always Free-eligible*.
- Entrar a la consola al menos una vez al mes.
- Mirar de vez en cuando *Billing → Cost Analysis*: debe decir $0.

La tarjeta quedó registrada solo para verificar la cuenta. Sin pasar a *Pay As You Go*, Oracle no
cobra.

### A futuro: un servidor más holgado para seguir desarrollando
Pasando la cuenta a *Pay As You Go*, Oracle cobra **solo lo que pasa de lo gratis**. Además,
desaparece el riesgo de que apague el servidor por poco uso.

Precio del Ampere A1 según Oracle: **US$ 0,01 por OCPU-hora y US$ 0,0015 por GB-hora** (otra página
suya muestra hasta ~30 % más; confirmar en el *Cost Estimator*). Un mes son ~730 horas.

| Servidor | Para qué | Costo al mes (aprox.) |
|---|---|---|
| **2 OCPU, 12 GB** (el de hoy) | la ERP con holgura para un equipo chico | **US$ 0** |
| **4 OCPU, 24 GB** | la ERP + una copia de pruebas completa, y construir rápido | **≈ US$ 28 a 36** |
| **8 OCPU, 48 GB** | varios sistemas, muchos usuarios o IA local | **≈ US$ 83 a 108** |
| Disco extra sobre 200 GB | más archivos y respaldos | ≈ US$ 4 por cada 100 GB |

- **Antes de pagar:** en el mismo servidor gratis se puede montar una **copia de pruebas**
  (`pruebas.erp.innvolt.cl`, con su propia base) para probar fases nuevas sin tocar la de verdad.
- **Al pasar a pago:** crear un **presupuesto con aviso** (*Billing → Budgets*, por ejemplo US$ 10)
  para que avise si algo empieza a cobrar.
