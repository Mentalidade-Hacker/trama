# Trama 0.6

Notas conectadas e estudo de escrita em português e inglês, com dados locais no computador.

## Nesta versão

- Aparência **Claro**, **Escuro** ou **Seguir o sistema**, com preferência salva no navegador. O padrão continua claro.
- Páginas e blocos conectados, backlinks, referências, consultas, grafo, tabelas, Kanban, templates, anexos e backups.
- **Aprender a escrever**: 60 registros de vocabulário bilíngue, 12 lições de escrita, exercícios e revisão do vocabulário guardado.
- Ortografia offline em português BR/PT e inglês US/UK, além do dicionário de significados incluído nos pacotes completos.

## Baixar e abrir

Baixe `trama-v0.6-windows-linux.zip` ou `trama-v0.6-windows-linux.tar.gz` nos anexos desta versão. O arquivo `trama-v0.6-SHA256.txt` permite conferir os downloads. Os arquivos automáticos **Source code** do GitHub não incluem a base SQLite do dicionário de significados.

O uso básico requer **Python 3.10 ou mais recente** e um navegador atual. Não exige Node.js, npm ou instalação de bibliotecas Python adicionais.

- **Windows:** extraia o pacote e abra `start.cmd`. Para instalar no seu usuário, use `install-windows.cmd`.
- **Arch Linux:** instale Python com `sudo pacman -S --needed python`; na pasta extraída, execute `bash start.sh`. `bash install.sh` adiciona o aplicativo ao menu.

O pacote contém código-fonte e lançadores; Python não vem embutido. O aplicativo abre uma conexão local em `http://127.0.0.1:8765`.

## Recursos opcionais

Gramática e tradução precisam de uma instalação inicial com internet. Depois, o processamento ocorre localmente:

- **Gramática:** `setup-writing.cmd` no Windows; `sudo pacman -S --needed languagetool` no Arch, ou o instalador portátil descrito em `WRITING.md`.
- **Tradução PT ↔ EN:** `setup-translation.cmd` no Windows ou `bash setup-translation.sh` no Arch. Consulte `TRANSLATION.md` para os requisitos dos modelos.

Ortografia e dicionário já estão incluídos nos pacotes completos. As notas não são enviadas aos serviços de download.

## Verificação e limites

106 testes JavaScript e 102 testes Python passaram localmente no Windows, além da verificação visual do tema e das funções de estudo. A verificação automática do repositório está configurada para Ubuntu e Windows com Python 3.13 e Node.js 24. A instalação em Arch Linux real ainda não foi testada.

O Trama é inspirado no Roam Research, sem reproduzir todas as suas funções ou oferecer compatibilidade integral. Não é um produto oficial do Roam. Traduções e sugestões de escrita podem precisar de revisão humana.
