# Hub de Ferramentas

SPA estática em React, TypeScript e Vite. Os dados pessoais permanecem no IndexedDB do navegador; não existe backend ou sincronização remota.

## Desenvolvimento

```bash
npm install
npm run dev
npm test
npm run build
npm run preview
```

O build para publicação fica em `dist/`. O `netlify.toml` configura o fallback de rotas da SPA.

## Dados e mudança de endereço

IndexedDB é isolado por origem. `file://`, cada porta de `localhost`, deploy previews e o domínio final da Netlify possuem bases diferentes. Antes de trocar de endereço, use **Exportar backup** na página de Hábitos. No endereço novo, use **Importar backup** e escolha mesclar ou substituir.

O projeto abre a base legada `HabitTrackerDB` sem elevar sua versão automaticamente quando ela contém hábitos. Os sete valores de `days` são exibidos como marcações legadas sem data. Para começar a registrar datas reais, use **Baixar backup e habilitar datas**; a ação baixa uma cópia antes de criar a store `habitCheckins` na versão nativa 2.
