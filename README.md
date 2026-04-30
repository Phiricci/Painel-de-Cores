# Solitario - Painel de Cores 3D

Dashboard online para mistura, calibração, receitas e técnicas de pintura de impressões 3D em resina.

## Rodar localmente

```bash
npm install
npm run dev
```

## Publicar

Build de produção:

```bash
npm run build
```

Diretório gerado para hospedagem estática:

```text
dist
```

Configurações recomendadas em Vercel, Netlify ou Cloudflare Pages:

- Build command: `npm run build`
- Output/Publish directory: `dist`

## Observação

As receitas e calibrações do usuário são salvas no navegador via `localStorage`. Cada visitante mantém seus próprios dados locais.
