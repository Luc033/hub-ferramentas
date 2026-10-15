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

IndexedDB é isolado por origem. `file://`, cada porta de `localhost`, deploy previews e o domínio final da Netlify possuem bases diferentes. Antes de trocar de endereço, abra **Configurações → Dados locais** e use **Exportar dados (.json)**. No endereço novo, selecione o arquivo, confira a prévia e escolha mesclar ou substituir. O backup reúne todas as stores habilitadas e as preferências globais de interface, áudio, notificações e Pomodoro; a substituição baixa uma cópia de segurança antes da confirmação final.

O projeto abre a base legada `HabitTrackerDB` sem elevar sua versão automaticamente quando ela contém hábitos. Os sete valores de `days` são exibidos como marcações legadas sem data. Para começar a registrar datas reais, use **Baixar backup e habilitar datas**; a ação baixa uma cópia antes de criar a store `habitCheckins` na versão nativa 2.

Anotações e Mapa Mental usam a versão nativa 4, com as stores `notes`, `boards`, `nodes` e `edges`. A área criativa só eleva o schema depois de baixar um backup e receber confirmação. A migração é aditiva: mantém `habits`, `habitCheckins` e `tasks`, criando qualquer store intermediária ausente. O conteúdo das notas é tratado como texto simples.

O editor hierárquico de Mapas Mentais começa na versão nativa 6 com as stores próprias `mindMaps` e `mindMapTopics`. Os recursos visuais MM-3 usam uma expansão opcional para a versão 7, com `mindMapConnections` e `mindMapAssets`. As duas migrações exigem backup e confirmação e são aditivas. A separação preserva o quadro livre legado sem inventar relações de pai entre seus nós. Conexões transversais não mudam a hierarquia; imagens PNG, JPEG e WebP ficam somente no IndexedDB, com limite de 5 MB, e o backup global converte esses blobs para data URLs validadas durante exportação e restauração.

As preferências de interface e a sessão ativa do Timer usam chaves locais versionadas no `localStorage`. Essa política evita elevar silenciosamente a versão de uma base legada apenas para trocar tema ou volume. Hábitos e check-ins continuam no IndexedDB e não são duplicados no `localStorage`.

## Ferramentas disponíveis

- Rastreador de Hábitos, incluindo marcações datadas após backup/migração, navegação semanal e atualização automática na mudança do dia local.
- Timer com relógio absoluto, persistência, confirmação antes de substituir sessões de outra ferramenta ou sessões em andamento e associação opcional sincronizada com a tarefa.
- Pomodoro automático com fases 25/5/15 e quantidade de focos por ciclo configuráveis, inclusive com recuperação idempotente de fases vencidas após recarga.
- Kanban A Fazer/Fazendo/Concluído, com destino de ordenação, suporte a toque, controles acessíveis, persistência transacional e contagem de focos por tarefa vinculada.
- Anotações em texto simples com salvamento automático serializado, flush ao sair, recuperação de falhas e criação de nós no mapa mental.
- Biblioteca de mapas mentais com criação, busca, ordenação, renomeação, duplicação e exclusão confirmada.
- Editor hierárquico com raiz única, filhos e irmãos, edição inline, recolhimento, exclusão com desfazer, layout radial, pan, zoom, enquadramento e autosave transacional.
- Interações MM-2 com reparent e reordenação por Pointer Events, alternativa acessível “Mover para”, posições manuais, tópicos independentes, seleção múltipla, busca, duplicação e clipboard de ramificações.
- Recursos MM-3 para mapas mentais: layouts radial, à direita, organograma e manual; temas e estilos por tópico; ícones, notas em texto simples, links seguros e imagens locais; conexões transversais rotuladas; Outline e modo de foco.
- Quadro livre legado com nós, conexões, arraste, pan, zoom e histórico de sessão, preservado separadamente.
- Sons de foco sintetizados no navegador, rádio FluxFM Chillhop e playlists públicas validadas e incorporadas pelo player oficial do SoundCloud. O catálogo só exibe URLs aprovadas pelo oEmbed em tempo de execução, e o miniplayer global mantém a reprodução durante a navegação interna.

Ao abrir o Kanban pela primeira vez, o Hub baixa um backup e pede confirmação antes de elevar `HabitTrackerDB` para a versão nativa 3 e criar a store `tasks`. A migração também cria `habitCheckins` quando ela ainda não existe e nunca converte `days[7]` em datas.

Os sons precisam de uma interação do usuário para iniciar, conforme as regras de reprodução dos navegadores. Eles não continuam com o navegador fechado. Rádio e playlists dependem de conexão, disponibilidade regional e regras dos provedores. Playlists adicionadas ficam na store `focusPlaylists` do IndexedDB nativo v5; nenhuma faixa é extraída, baixada ou enviada a um backend.

As próximas etapas do editor de mapas reservam exportações próprias em JSON/PNG/SVG, histórico persistente e robustez multiaba. Esses controles não aparecem como ações falsas.
