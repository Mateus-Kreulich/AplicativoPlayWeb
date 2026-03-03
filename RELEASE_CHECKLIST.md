# Release checklist

## Autosave / JSON
- [ ] Vincular JSON e validar status `JSON sincronizado`.
- [ ] Reabrir app e confirmar restauração automática do arquivo vinculado.
- [ ] Simular perda de permissão e validar status `aguardando permissão` + reautorização.
- [ ] Confirmar checkpoint ao completar jornada 4h e 8h.
- [ ] Confirmar fallback local (`localStorage` + backup) sem arquivo vinculado.

## Offline / PWA
- [ ] Primeira carga online completa (instalação SW).
- [ ] Recarregar offline e validar UI básica carregada.
- [ ] Validar fallback para `offline.html` quando navegação sem cache falhar.
- [ ] Validar atualização de versão SW exibindo banner e atualização.

## Testes / Qualidade
- [ ] Executar `node --test tests/*.test.js`.
- [ ] Executar smoke Playwright (`tests/ui-integration.playwright.py`) em ambiente com Playwright instalado.
- [ ] Revisar logs de erro no console e no logger local (`dragonpoint_logs`).
