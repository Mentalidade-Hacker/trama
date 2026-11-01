/** Authored offline suggestions. These are contextual choices, not interchangeable synonyms. */
const option=(id,forms,meaning,usage,example)=>({id,forms:forms.split('|'),word:forms.split('|')[0],meaning,usage,examples:[{text:example,translation:''}]});
const family=(id,language,forms,partOfSpeech,alternatives)=>({id:`${language}-${id}`,language,forms:forms.split('|'),word:forms.split('|')[0],partOfSpeech,alternatives});
export const VOCABULARY_FAMILIES=[
  family('importante','pt','importante|importantes','adjetivo',[
    option('relevante','relevante|relevantes','Que tem relação significativa com o assunto.','Use quando algo contribui para uma questão específica; não significa necessariamente indispensável.','O relatório apresenta dados relevantes para a decisão.'),
    option('essencial','essencial|essenciais','Que é necessário para o funcionamento ou para a finalidade de algo.','É uma afirmação mais forte que importante. Reserve para o que não pode faltar.','O acesso à água é essencial para a comunidade.')]),
  family('bom','pt','bom|boa|bons|boas','adjetivo',[
    option('util','útil|útil|úteis|úteis','Que ajuda a realizar uma tarefa ou atender a uma necessidade.','Especifica a utilidade; não avalia todas as qualidades de uma pessoa ou coisa.','A lista foi útil para organizar a mudança.'),
    option('eficaz','eficaz|eficaz|eficazes|eficazes','Que produz o efeito pretendido.','Use para ações ou métodos que atingem um objetivo, quando houver motivo para essa avaliação.','O novo procedimento foi eficaz na redução dos atrasos.')]),
  family('ruim','pt','ruim|ruins','adjetivo',[
    option('prejudicial','prejudicial|prejudiciais','Que causa dano ou desvantagem.','Exige indicar ou reconhecer um prejuízo; algo desagradável nem sempre é prejudicial.','A falta de sono é prejudicial à concentração.'),
    option('ineficaz','ineficaz|ineficazes','Que não produz o efeito esperado.','Use para avaliar um método ou uma ação em relação ao objetivo, sem condenar a pessoa.','A medida foi ineficaz para resolver o problema.')]),
  family('grande','pt','grande|grandes','adjetivo',[
    option('consideravel','considerável|consideráveis','Que tem quantidade ou importância suficiente para merecer atenção.','Útil para quantidades e impactos; não substitui toda referência a tamanho físico.','A mudança exigiu um esforço considerável.'),
    option('abrangente','abrangente|abrangentes','Que inclui muitos aspectos de um assunto.','Use para alcance ou cobertura, como em uma análise; não para altura ou volume.','A pesquisa oferece uma análise abrangente do tema.')]),
  family('pequeno','pt','pequeno|pequena|pequenos|pequenas','adjetivo',[
    option('breve','breve|breve|breves|breves','Que dura pouco ou se expressa em poucas palavras.','Serve para duração ou extensão de uma fala/texto, não para qualquer objeto pequeno.','Ela fez uma breve apresentação do projeto.'),
    option('limitado','limitado|limitada|limitados|limitadas','Que tem alcance, quantidade ou capacidade restrita.','Indica uma restrição; pode mudar a avaliação da frase, então confira o sentido.','O projeto tem um orçamento limitado.')]),
  family('claro','pt','claro|clara|claros|claras','adjetivo',[
    option('compreensivel','compreensível|compreensível|compreensíveis|compreensíveis','Que pode ser entendido.','Use para explicações ou textos; não substitui claro no sentido de cor ou iluminação.','A explicação ficou compreensível para quem estava começando.'),
    option('evidente','evidente|evidente|evidentes|evidentes','Que se percebe ou se reconhece com facilidade.','Pode afirmar mais certeza que claro. Confira se a evidência realmente sustenta a frase.','A diferença entre os resultados ficou evidente.')]),
  family('dificil','pt','difícil|difíceis','adjetivo',[
    option('exigente','exigente|exigentes','Que demanda esforço, cuidado ou habilidade.','Para uma tarefa ou atividade que pede dedicação. Não é equivalente a impossível.','O treinamento foi exigente, mas a equipe recebeu apoio.')]),
  family('facil','pt','fácil|fáceis','adjetivo',[
    option('simples','simples|simples','Que tem pouca complexidade.','Pouca complexidade não garante pouco esforço. Escolha conforme o aspecto que quer destacar.','O formulário tem instruções simples.'),
    option('acessivel','acessível|acessíveis','Que pode ser alcançado, utilizado ou compreendido.','Explique se fala de compreensão, acesso físico ou custo; esses sentidos são diferentes.','O guia usa uma linguagem acessível.')]),
  family('rapido','pt','rápido|rápida|rápidos|rápidas','adjetivo',[
    option('agil','ágil|ágil|ágeis|ágeis','Que atua com rapidez e facilidade de adaptação ou movimento.','Adequado para um processo ou uma atuação; não garante qualidade por si só.','A equipe organizou um atendimento ágil.'),
    option('imediato','imediato|imediata|imediatos|imediatas','Que ocorre sem demora.','É mais forte que rápido. Use apenas se não houver uma espera relevante.','O sistema envia uma confirmação imediata.')]),
  family('lento','pt','lento|lenta|lentos|lentas','adjetivo',[
    option('gradual','gradual|gradual|graduais|graduais','Que acontece por etapas.','Descreve a progressão, sem necessariamente criticar a velocidade.','A adaptação ao novo horário foi gradual.'),
    option('demorado','demorado|demorada|demorados|demoradas','Que leva bastante tempo.','Destaca a duração, e não a velocidade de um movimento.','O processo de revisão foi demorado.')]),
  family('novo','pt','novo|nova|novos|novas','adjetivo',[
    option('recente','recente|recente|recentes|recentes','Que ocorreu ou surgiu há pouco tempo.','Indica tempo; não significa necessariamente inédito ou pouco usado.','O artigo reúne pesquisas recentes.'),
    option('original','original|original|originais|originais','Que apresenta uma elaboração própria ou pouco comum.','Indica autoria ou novidade de abordagem; algo recente pode não ser original.','A autora apresentou uma interpretação original.')]),
  family('velho','pt','velho|velha|velhos|velhas','adjetivo',[
    option('antigo','antigo|antiga|antigos|antigas','Que pertence a um tempo anterior ou existe há muito tempo.','Pode indicar valor histórico; não afirma que o objeto está gasto.','O museu conserva mapas antigos.'),
    option('desatualizado','desatualizado|desatualizada|desatualizados|desatualizadas','Que não acompanha informações ou condições atuais.','Use quando a informação deixou de refletir a situação presente, não apenas por sua idade.','O endereço publicado no guia estava desatualizado.')]),
  family('problema','pt','problema|problemas','substantivo',[
    option('obstaculo','obstáculo|obstáculos','Aquilo que dificulta alcançar um objetivo.','Destaca uma barreira concreta; nem todo problema impede uma ação.','A falta de transporte era um obstáculo para participar do curso.'),
    option('impasse','impasse|impasses','Situação sem uma saída acordada ou imediata.','Use quando as partes ou as opções não permitem avançar; é mais específico que problema.','A negociação chegou a um impasse.')]),
  family('coisa','pt','coisa|coisas','substantivo',[
    option('questao','questão|questões','Assunto ou ponto que precisa ser considerado.','Use quando coisa se refere a um assunto, não a um objeto material.','Precisamos discutir uma questão antes de decidir.'),
    option('tarefa','tarefa|tarefas','Atividade que precisa ser realizada.','Use quando você quer nomear uma ação a cumprir. Às vezes, o nome exato da ação é ainda melhor.','Anotei as tarefas para amanhã.')]),
  family('ideia','pt','ideia|ideias','substantivo',[
    option('proposta','proposta|propostas','Sugestão de ação apresentada para consideração.','Pressupõe algo que pode ser discutido ou realizado; não se aplica a todo pensamento.','A equipe apresentou uma proposta para reduzir o desperdício.'),
    option('hipotese','hipótese|hipóteses','Explicação ou suposição que ainda pode ser examinada.','Não a apresente como conclusão confirmada.','O estudo avaliou a hipótese de que a iluminação afetava o sono.')]),
  family('ajuda','pt','ajuda|ajudas','substantivo',[
    option('orientacao','orientação|orientações','Informação ou direção que auxilia uma decisão ou ação.','Use quando ajuda é um substantivo e envolve instruções, não para substituir o verbo ajuda.','Recebi orientações para preencher o documento.'),
    option('assistencia','assistência|assistências','Apoio prestado a alguém para atender a uma necessidade.','Tem um tom mais formal e pode indicar um serviço. Confira se isso cabe na situação.','A equipe oferece assistência durante a instalação.')]),
  family('mudanca','pt','mudança|mudanças','substantivo',[
    option('modificacao','modificação|modificações','Alteração de uma parte ou característica.','Serve para ajustes identificáveis; não implica uma transformação completa.','O texto recebeu algumas modificações após a revisão.'),
    option('transformacao','transformação|transformações','Mudança que altera de maneira marcante a forma ou a condição.','É mais forte que mudança. Use quando a amplitude justificar.','A biblioteca passou por uma transformação após a reforma.')]),
  family('resultado','pt','resultado|resultados','substantivo',[
    option('efeito','efeito|efeitos','Consequência produzida por uma ação ou condição.','Destaca a relação com uma causa; não é o mesmo que uma medição ou uma conclusão.','A mudança de horário teve efeitos no atendimento.'),
    option('desfecho','desfecho|desfechos','Conclusão de uma história, situação ou sequência de acontecimentos.','Use para o encerramento de um processo narrativo ou de uma situação.','O acordo deu um desfecho à negociação.')]),
  family('mostrar','pt','mostrar','verbo',[
    option('demonstrar','demonstrar','Tornar algo claro por evidência, explicação ou exemplo.','Pode exigir evidências mais fortes que apenas mostrar.','O relatório procura demonstrar como o método funciona.'),
    option('apresentar','apresentar','Expor algo para que outras pessoas conheçam ou examinem.','Não afirma por si só que aquilo foi comprovado.','Vou apresentar os resultados na reunião.')]),
  family('usar','pt','usar','verbo',[
    option('aplicar','aplicar','Colocar um método, conhecimento ou recurso em prática.','Serve para regras e técnicas; usar costuma ser mais natural para muitos objetos cotidianos.','Quero aplicar essa técnica na próxima revisão.'),
    option('empregar','empregar','Fazer uso de um recurso ou meio para uma finalidade.','Tem um tom mais formal. Prefira usar se a alternativa não acrescentar precisão.','O estudo emprega dois métodos de análise.')]),
  family('important','en','important','adjective',[
    option('relevant','relevant','Connected to the particular question being considered.','Use for a connection to the topic; relevant does not necessarily mean essential.','The report includes evidence relevant to the decision.'),
    option('essential','essential','Necessary for a particular purpose or function.','This is stronger than important. Use it for something that cannot reasonably be left out.','Clean water is essential to public health.')]),
  family('good','en','good','adjective',[
    option('useful','useful','Helpful for a particular purpose.','Specify usefulness rather than praising every quality.','The checklist was useful during the move.'),
    option('effective','effective','Successful in producing the intended result.','Use when you can identify the goal and have a reason to judge the result.','The new procedure was effective in reducing delays.')]),
  family('bad','en','bad','adjective',[
    option('harmful','harmful','Causing damage or an adverse effect.','Something unpleasant is not necessarily harmful; consider the actual effect.','Lack of sleep can be harmful to concentration.'),
    option('ineffective','ineffective','Not producing the intended result.','Evaluate a method or action against its goal, rather than judging a person.','The measure was ineffective in resolving the issue.')]),
  family('big','en','big','adjective',[
    option('substantial','substantial','Large enough in amount or importance to matter.','Useful for amounts, effort, or impact; not a replacement for every physical size.','The change required substantial effort.'),
    option('extensive','extensive','Covering a wide area or many parts of a subject.','Use for scope or coverage rather than height or importance alone.','The team carried out extensive research.')]),
  family('small','en','small','adjective',[
    option('limited','limited','Restricted in amount, extent, or availability.','Highlights a restriction; it may change the tone of the original statement.','The project has a limited budget.'),
    option('minor','minor','Less serious or less important in a particular comparison.','Do not use it merely for physical size or to dismiss a problem without evidence.','The editor suggested a minor revision to the introduction.')]),
  family('clear','en','clear','adjective',[
    option('understandable','understandable','Possible to understand.','Use the adjective for an explanation or message; not for the verb clear or for transparent material.','The instructions are understandable without technical training.'),
    option('evident','evident','Easy to notice or recognize from what is available.','May express stronger certainty. Check whether the evidence supports that claim.','The difference between the results became evident.')]),
  family('difficult','en','difficult','adjective',[
    option('demanding','demanding','Requiring considerable effort, attention, or skill.','Focuses on what a task requires, without saying it is impossible.','The training was demanding, but the team received support.'),
    option('complex','complex','Having several connected parts that require consideration.','Complexity and difficulty are different: a complex task can become familiar with practice.','The report examines a complex relationship between the factors.')]),
  family('easy','en','easy','adjective',[
    option('straightforward','straightforward','Relatively simple to understand or carry out.','Use when a process has no major complications; it still may require effort.','The application process is straightforward.'),
    option('accessible','accessible','Possible to reach, use, or understand.','State which kind of access you mean: language, physical access, or availability.','The guide uses accessible language.')]),
  family('fast','en','fast','adjective',[
    option('rapid','rapid','Happening or moving at a high rate.','Use as an adjective, such as rapid growth; it does not replace the adverb in run fast.','The town experienced rapid growth.'),
    option('prompt','prompt','Done without unnecessary delay.','Useful for responses or action, not every kind of speed.','We received a prompt response to the request.')]),
  family('slow','en','slow','adjective',[
    option('gradual','gradual','Happening in stages over time.','Describes progression rather than necessarily criticizing speed; use as an adjective.','The transition to the new schedule was gradual.'),
    option('lengthy','lengthy','Taking a long time or containing a large amount of text.','Refers to duration or length, not the speed of a moving object.','The review process was lengthy.')]),
  family('new','en','new','adjective',[
    option('recent','recent','Happening or appearing not long ago.','Indicates time, not necessarily originality or lack of previous use.','The article brings together recent studies.'),
    option('original','original','Developed independently or presenting an unusual approach.','Use for authorship or approach; a recent idea is not necessarily original.','The author offered an original interpretation.')]),
  family('old','en','old','adjective',[
    option('historic','historic','Important in history.','This is a claim about historical significance, not simply age.','The museum preserves documents from a historic agreement.'),
    option('outdated','outdated','No longer reflecting current information or conditions.','Use when something is no longer current, rather than merely old.','The address in the guide was outdated.')]),
  family('problem','en','problem|problems','noun',[
    option('difficulty','difficulty|difficulties','A situation or factor that makes an activity harder.','Describes a challenge, without necessarily suggesting a fault or a complete barrier.','Transport difficulties prevented some people from attending.'),
    option('obstacle','obstacle|obstacles','Something that stands in the way of a goal.','Highlights a barrier to progress; not every problem is an obstacle.','Lack of transport was an obstacle to participation.')]),
  family('thing','en','thing|things','noun',[
    option('detail','detail|details','A particular piece of information or a small part of something.','Use when thing refers to a specific part or fact, not an entire task or object.','We need to confirm one detail before deciding.'),
    option('task','task|tasks','An activity that needs to be completed.','Use when you mean work to do. Naming the exact activity can be even clearer.','I wrote down the tasks for tomorrow.')]),
  family('idea','en','idea|ideas','noun',[
    option('approach','approach|approaches','A way of considering or dealing with something.','Use for a method or perspective, not every thought.','The team proposed an approach that reduces waste.'),
    option('option','option|options','One of the available choices.','Implies that a choice can be considered; it is not a synonym for imagination or belief.','We discussed an option that would reduce the cost.')]),
  family('help','en','help','noun',[
    option('guidance','guidance','Information or advice that supports a decision or action.','Use when help is a noun and means advice; not as a replacement for the verb help.','I received guidance on completing the document.'),
    option('support','support','Assistance or resources provided to someone.','Can mean practical, emotional, or financial assistance. Specify which kind matters.','The team provides support during installation.')]),
  family('change','en','change|changes','noun',[
    option('adjustment','adjustment|adjustments','A change made to improve fit or respond to a condition.','Use the noun for a relatively specific alteration, not the verb change.','The text needed a few adjustments after the review.'),
    option('transformation','transformation|transformations','A marked change in form or condition.','Stronger than change; choose it when the scale of the change justifies it.','The library underwent a transformation after the renovation.')]),
  family('result','en','result|results','noun',[
    option('finding','finding|findings','Information established through an investigation or examination.','Use for what a study or inquiry found; not every result comes from research.','The report presents the main findings of the study.'),
    option('consequence','consequence|consequences','Something that follows from an action or condition.','Emphasizes a causal relationship and can describe positive or negative effects.','The change had consequences for access to the service.')]),
  family('show','en','show|shows|showed|showing','verb',[
    option('demonstrate','demonstrate|demonstrates|demonstrated|demonstrating','Make something clear through evidence, explanation, or an example.','Use the verb when evidence or explanation supports the claim; not for the noun show.','The report demonstrates how the method works.'),
    option('present','present|presents|presented|presenting','Put information before others for consideration.','Does not by itself mean that the information has been proved.','I will present the results at the meeting.')]),
  family('use','en','use|uses|used|using','verb',[
    option('apply','apply|applies|applied|applying','Put a method, rule, or knowledge into practice.','Use for techniques or rules; use is often more natural for everyday objects.','I want to apply this technique in the next review.'),
    option('employ','employ|employs|employed|employing','Make use of a resource or method for a purpose.','More formal than use. Keep use if the alternative adds no useful precision.','The study employs two methods of analysis.')]),
];
