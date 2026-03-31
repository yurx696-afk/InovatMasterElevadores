# Landing page — Elevadores (estática)

Esta landing page foi feita para **converter** com foco em **segurança, confiabilidade e rapidez**, usando HTML semântico, design corporativo (azul/cinza/branco), CTAs claros e formulário com validação em tempo real.

## Como rodar

- **Opção 1 (recomendado, sem instalar nada no Windows):**
  - Abra o PowerShell na pasta e rode: `.\serve.ps1 -Port 5500`
  - Acesse `http://localhost:5500`
  - Para parar: **Ctrl + C**

- **Opção 2 (se você tiver Python instalado):**
  - `python -m http.server 5500`
  - Acesse `http://localhost:5500`

## O que você precisa personalizar (obrigatório)

- **Empresa / contato** (em `index.html`)
  - Nome da empresa
  - Telefone (link `tel:`)
  - E-mail
  - **CNPJ e endereço**
  - Cidade/região atendida
- **WhatsApp** (em `app.js`)
  - `CONFIG.whatsapp.phoneE164` (somente dígitos, ex: `5511999999999`)
- **Números e prova social**
  - Ajuste os números (anos, elevadores atendidos, SLA) para valores reais
  - Troque depoimentos e “Cliente A/B/C/D” por nomes/logos reais
- **SEO local (schema.org)**
  - Ajuste o bloco JSON-LD em `index.html` (nome, telefone, endereço, cidade/UF)

## Imagens reais (performance + credibilidade)

No `index.html` existem referências a:

- `assets/elevador-hero.jpg`
- `assets/equipe-tecnica.jpg`
- `assets/obra-modernizacao.jpg`
- `assets/antes.jpg`
- `assets/depois.jpg`

Coloque essas imagens na pasta `assets/` e **otimize** antes de publicar:

- Use JPEG bem comprimido ou WebP/AVIF quando possível
- Meta: **hero** ~ 200–350KB; demais ~ 80–200KB
- Mantenha dimensões coerentes com o layout (evite 4000px desnecessários)

As imagens já usam `loading="lazy"` (exceto a principal do hero).

## Tracking e eventos (GA4 / Meta Pixel / Clarity)

Em `app.js`, configure:

- `CONFIG.tracking.ga4MeasurementId`
- `CONFIG.tracking.metaPixelId`
- `CONFIG.tracking.clarityProjectId`

Eventos já emitidos:

- `page_view`
- `click` (com `data-track`)
- `form_submit` / `form_error`
- `ab_variant`

## Teste A/B (CRO)

Existe um teste simples via querystring:

- Variante 1: `?v=1`
- Variante 2: `?v=2`

Você pode ligar isso ao seu tráfego/ads e comparar conversões por variante no GA4/Pixel.

## Integração do formulário (WhatsApp/CRM)

No padrão atual, o envio **redireciona para o WhatsApp** com mensagem preenchida (baixa fricção).

Se quiser integrar com CRM:

- Substitua o `window.location.href = ...` no submit por um `fetch()` para sua API/endpoint do CRM
- Mantenha o WhatsApp como fallback (ex.: botão ao lado ou após sucesso)

## Publicação

- Publique em qualquer host estático (Netlify, Vercel, Cloudflare Pages, host próprio)
- Garanta **HTTPS ativo**
- Domínio oficial configurado: **https://inovatelevadoresmaster.com.br/**
- `robots.txt` e `sitemap.xml` já apontam para esse domínio

# InovatMaster
