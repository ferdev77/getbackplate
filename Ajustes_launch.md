# Ajustes pre-launch (Etapa 1)

Fecha: 2026-04-06

Este documento registra los ajustes operativos ejecutados en produccion para cierre de Etapa 1, incluyendo estado final, evidencia tecnica y pendiente bloqueado por permisos.

## Alcance solicitado

Se revisaron y resolvieron estos puntos:

1. APP_BASE_URL en Produccion
2. NEXT_PUBLIC_APP_URL en Produccion
3. CRON_SECRET en Produccion
4. Dominio custom `app.getbackplate.com` en Vercel + dato CNAME para DNS
5. Confirmacion de region real de Supabase Produccion

## Resultado ejecutivo

- Resueltos: puntos 1, 2, 3 y 5
- Pendiente: punto 4 (bloqueado por permisos de dominio en Vercel team actual)

## Cambios aplicados

### 1) APP_BASE_URL (Produccion)

- Valor anterior detectado: `http://localhost:3000`
- Valor nuevo aplicado: `https://app.getbackplate.com`
- Estado: OK

### 2) NEXT_PUBLIC_APP_URL (Produccion)

- Valor anterior detectado: `https://getbackplate.vercel.app`
- Valor nuevo aplicado: `https://app.getbackplate.com`
- Estado: OK

### 3) CRON_SECRET (Produccion)

- Valor anterior detectado: secreto corto de baja seguridad
- Accion aplicada: rotacion por secreto aleatorio criptograficamente seguro
- Longitud nueva: 64 caracteres
- Estado: OK

Nota: por seguridad, no se documenta el valor del secreto.

### 4) Region real Supabase Produccion

- Proyecto Produccion: `mfhyemwypuzsqjqxtbjf` (`Getbackplate`)
- Region confirmada: `West US (Oregon)`
- Correlacion tecnica: consistente con host pooler `aws-0-us-west-2.pooler.supabase.com`
- Estado: OK

##  Dominio custom (Vercel)

### 5) app.getbackplate.com


Dato para DNS

- Tipo: `CNAME`
- Host/Name: `app`
- Target/Value: `e3cf3db331b04ba3.vercel-dns-017.com.`

## Evidencia operativa

- Entorno Vercel verificado con `vercel env ls` y `vercel env pull --environment production`.
- Variables de Produccion verificadas luego del cambio:
  - `APP_BASE_URL="https://app.getbackplate.com"`
  - `NEXT_PUBLIC_APP_URL="https://app.getbackplate.com"`
  - `CRON_SECRET` presente y rotado 
- Redeploy de Produccion ejecutado para aplicar cambios:
  - `https://getbackplate-9qe5zgc87-getbackplates-projects.vercel.app`
- Region Supabase verificada con CLI y revision real:
  - `npx supabase projects list`


