# Trama 0.8

Sincronização mais clara, retomada de transferências e comparação antes de escolher entre versões divergentes.

## O que mudou

- **Comparar e escolher** mostra páginas e blocos adicionados, removidos e alterados, com amostras dos textos antes e depois. A comparação valida o arquivo recebido e não altera notas.
- Se notas, anexos ou versões disponíveis mudarem depois da comparação, o recebimento é recusado até uma nova comparação. Cópias anteriores continuam preservadas.
- **Verificar agora** agenda uma checagem sem travar a tela. No modo manual, confere somente a pasta local e mantém o modo automático desligado.
- Horários separados para verificar, publicar na pasta, enviar ao Proton, baixar e aplicar uma versão. Uma verificação sem transferência não é apresentada como novo envio.
- Indicadores para alterações pendentes, edição em andamento, versões divergentes, cópias incompletas e servidor local indisponível. O modo pasta não afirma que o aplicativo externo já enviou os dados à nuvem.
- Nome editável para identificar cada computador e orientação para conectar a segunda máquina. Verificar não descarta os campos de configuração em edição; salvar bloqueia esses campos até a resposta.
- Tentativas com espera progressiva após falhas. O botão de verificação permite antecipar a próxima tentativa. Mudanças de configuração que não puderem ser salvas não alteram a conexão em uso.
- Proteção durante composição de texto e enquanto uma comparação está aberta, evitando aplicação automática nesse intervalo.
- O transporte Proton confere o conteúdo dos arquivos remotos já existentes e verifica o resultado do upload. Arquivos ignorados pela CLI não são contados como transferidos. Uma interrupção depois de enviar o ZIP pode ser retomada sem reenviar esse arquivo quando ele estiver íntegro.
- O login trata falhas de inicialização, interrupções, timeout e encerramento sem permanecer aguardando indefinidamente.

## Baixar e usar

Use os pacotes completos `trama-v0.8-windows-linux.zip` ou `trama-v0.8-windows-linux.tar.gz`, que incluem o dicionário offline. Confira os downloads com `trama-v0.8-SHA256.txt`. Os arquivos automáticos **Source code** do GitHub não incluem essa base de significados.

- Windows: extraia e abra `start.cmd`.
- Arch Linux: instale Python e execute `bash start.sh` na pasta extraída.
- Recomenda-se atualizar os dois computadores para 0.8. As cópias de sincronização continuam usando o formato da 0.7.

O uso básico requer Python 3.10 ou mais recente e navegador atual. Para atualizar, feche o servidor anterior, preserve a pasta de dados e use o novo pacote/instalador. Os temas, tamanho das letras, recursos de notas e ferramentas de escrita continuam incluídos.

## Verificação e limites

Passaram **173 testes Python e 144 JavaScript** no ambiente Windows. No navegador, a comparação exibiu os textos divergentes, recusou uma confirmação desatualizada, permitiu a escolha após nova comparação e retomou a propagação automática entre duas instâncias isoladas. A verificação preservou o formulário em edição.

A transferência contra uma conta Proton real e a instalação em Arch Linux real ainda não foram executadas neste ambiente. Quando a CLI não fornece um digest de revisão verificável, a conferência pode exigir baixar arquivos temporariamente, consumindo banda adicional.

A sincronização requer configuração nos dois computadores e funciona enquanto o servidor Trama está aberto. Edições divergentes exigem escolha; não há edição colaborativa por caractere nem combinação automática de textos. As versões preservadas podem ocupar espaço; não são excluídas automaticamente. O Trama permanece inspirado no Roam Research, sem paridade integral.
