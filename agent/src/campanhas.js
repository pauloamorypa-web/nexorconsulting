/* Registro das campanhas de captação de leads e detecção da campanha de cada conversa.

   Cada campanha diz à Blue: para quem é (ICP), como abrir a conversa, o que perguntar (no máximo 4
   perguntas, uma por vez) e quais sinais indicam compra ou descarte. A pontuação usa o ICP daqui
   (ver qualificacao.js) e a cadência dos mornos usa os textos daqui (ver cadencia.js).

   Preços de referência: comercial/PLANOS-E-PRECOS.md e comercial/ELO-PRECOS.md (tabela em validação).
   A Blue só cita esses valores se CAMPANHA_MOSTRAR_PRECO=1; a cadência sugerida à equipe sempre traz. */

/** Normaliza para comparar: minúsculas e sem acentos. */
export const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const tokens = (s) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

/* Cargos de decisão que valem para todas as campanhas (texto já normalizado). */
export const DECISORES = /\b(dono|dona|socio|socia|proprietari[oa]|diretor[a]?|ceo|fundador[a]?|gerente|gestor[a]?|coordenador[a]?|responsavel|administrador[a]?|presidente|head|titular|empresari[oa])\b/;
export const INFLUENCIADORES = /\b(analista|assistente|tecnic[oa]|auxiliar|funcionari[oa]|colaborador[a]?|recepcionista|estagiari[oa]|atendente|secretari[oa]|vendedor[a]?)\b/;

export const CAMPANHAS = [
  {
    id: "atende-ia",
    nome: "Nexor Atende IA: teste grátis",
    produto: "Nexor Atende IA",
    utm: ["atende-ia", "atendeia", "atende", "teste12h", "whatsapp-ia", "atendimento-ia"],
    paginas: ["agente-de-ia-no-whatsapp", "atende"],
    gatilhos: { forte: /nexor atende|atende ia|teste do atende/, fraco: /atendente virtual|atendimento (com|por) ia|ia (no|pro|para o) whats|responder (os )?(meus )?clientes|whatsapp (lotado|cheio)/ },
    publico:
      "Empresas que vendem ou agendam pelo WhatsApp e não dão conta de responder: clínicas e consultórios, lojas, e-commerce, imobiliárias, escolas, academias, restaurantes e prestadores de serviço. Decisor: dono, sócio ou gerente comercial.",
    icp: {
      segmentos: /clinica|consultorio|odonto|dentist|estetica|loja|varejo|e-?commerce|imobiliaria|escola|curso|academia|restaurante|delivery|pizzaria|hamburgueria|concessionaria|otica|pet ?shop|veterinari|salao|hotel|pousada|farmacia|autopecas|oficina|prestador|servicos|distribuidora|construtora|corretora|seguros/,
      cnae: ["8630", "8640", "8650", "4781", "4782", "4789", "4771", "6821", "6822", "8513", "8599", "9313", "5611", "5620", "4511", "4520", "9602", "4530", "7500"],
      porte: [{ unidade: "mensagens por dia", minimo: 20, ideal: 60 }],
    },
    abertura:
      "Oi! Aqui é a Blue, a assistente de IA da Nexor 😊 Vi que você se interessou pelo teste do Nexor Atende IA, o atendente que responde os seus clientes no WhatsApp 24 horas.\n\nMe conta: qual é o ramo da sua empresa?",
    perguntas: [
      { sinal: "segmento", texto: "Qual é o ramo da empresa e quem responde o WhatsApp hoje?" },
      { sinal: "porte_numero", texto: "Mais ou menos quantas mensagens chegam por dia?" },
      { sinal: "dor", texto: "O que pesa mais hoje: a demora para responder, as mensagens fora do horário ou o cliente que some sem fechar?" },
      { sinal: "urgencia", texto: "Você quer colocar para rodar ainda este mês ou está planejando para mais adiante?" },
    ],
    sinais_compra: ["perde venda por demora para responder", "muitas mensagens por dia ou fora do horário", "quer agendar, gerar pedido ou link de pagamento pelo WhatsApp", "pede o teste ou a demonstração"],
    sinais_descarte: ["quer disparo em massa ou lista comprada", "uso pessoal, sem empresa", "estudante ou trabalho acadêmico", "empresa que vende chatbot (concorrente)"],
    dores: /demor|perco (muit[oa]s? )?(venda|cliente|paciente|pedido)|perdendo (venda|cliente|paciente|pedido)|nao (dou|damos|da) conta|fora do horario|de madrugada|fim de semana|sem resposta|lotad|sobrecarregad|cliente some|vacuo/,
    palavras: /whats|atendimento|responder|mensage|chatbot|atendente|agendamento de paciente|instagram/,
    preco: "planos a partir de R$ 497 por mês (Essencial, até 1.500 conversas), mais a implantação",
    material: "resumo dos planos do Atende IA e o link da demonstração no site",
    cadencia: {
      d0: {
        whatsapp: "Oi, {nome}! Aqui é da Nexor. Como combinado, segue o resumo do Nexor Atende IA: ele responde, qualifica e agenda pelo WhatsApp 24 horas e passa para a sua equipe quando precisa. {preco}Quer que eu ative o teste de 30 dias com os dados da {empresa}?",
        email: { assunto: "Nexor Atende IA: o resumo que você pediu", texto: "Olá, {nome}.\n\nSegue o resumo do Nexor Atende IA: atendimento e vendas 24 horas no WhatsApp, site e Instagram, treinado com os produtos, preços e regras da {empresa}. {preco}\n\nO teste é de 30 dias, sem cartão. Se quiser, responda este e-mail e a gente ativa.\n\nEquipe Nexor" },
      },
      d2: {
        whatsapp: "Oi, {nome}, tudo bem? Uma ideia rápida: no teste do Atende IA você mesmo vê como a IA responderia às perguntas que mais chegam na {empresa}. Leva uns 5 minutos para configurar. Quer que eu deixe pronto?",
        email: { assunto: "Veja a IA respondendo os seus clientes", texto: "Olá, {nome}.\n\nNo teste do Nexor Atende IA você cadastra as informações da {empresa} e conversa com o atendente virtual como se fosse um cliente. Assim dá para ver o resultado antes de decidir.\n\nQuer marcar 30 minutos com a equipe para montar junto?\n\nEquipe Nexor" },
      },
      d7: {
        whatsapp: "Oi, {nome}! Passando para saber se ainda faz sentido pensar no atendimento com IA para a {empresa}. Se for melhor deixar para depois, sem problema, é só me avisar.",
        email: { assunto: "Ainda faz sentido para a {empresa}?", texto: "Olá, {nome}.\n\nNão quero lotar a sua caixa de entrada. Se o atendimento com IA ainda estiver nos seus planos, é só responder e marcamos o diagnóstico gratuito. Se não for o momento, sem problema.\n\nEquipe Nexor" },
      },
    },
  },
  {
    id: "rh-ponto",
    nome: "Nexor RH + Ponto: teste grátis",
    produto: "Nexor RH + Ponto",
    utm: ["rh-ponto", "rh", "ponto", "ponto-eletronico", "nexor-rh", "folha"],
    paginas: ["sistema-de-ponto-eletronico", "rh"],
    gatilhos: { forte: /nexor rh|rh \+ ponto|rh e ponto|ponto eletronico|controle de ponto|registro de ponto/, fraco: /bater (o )?ponto|relogio de ponto|folha de pagamento|banco de horas|espelho de ponto|esocial|holerite|\brh\b/ },
    publico:
      "Empresas com 10 ou mais colaboradores que controlam ponto em relógio, papel ou planilha: comércio, indústria, serviços, clínicas, construtoras, restaurantes e agro. Decisor: dono, gerente administrativo ou responsável pelo RH/DP.",
    icp: {
      segmentos: null, // qualquer empresa com colaboradores
      cnae: "*",
      porte: [{ unidade: "colaboradores", minimo: 10, ideal: 30 }],
      decisoresExtra: /\b(rh|dp|departamento pessoal|recursos humanos)\b/,
    },
    abertura:
      "Oi! Sou a Blue, a assistente de IA da Nexor 😊 Vi que você chegou pelo Nexor RH + Ponto, o ponto pelo celular com biometria e o RH no mesmo sistema.\n\nPara eu te ajudar direito: quantos colaboradores a empresa tem hoje?",
    perguntas: [
      { sinal: "porte_numero", texto: "Quantos colaboradores a empresa tem hoje?" },
      { sinal: "ferramenta_atual", texto: "Como vocês controlam o ponto hoje: relógio, papel, planilha ou outro sistema?" },
      { sinal: "dor", texto: "O que dá mais trabalho no fechamento do mês?" },
      { sinal: "urgencia", texto: "Você pensa em trocar ainda neste mês ou mais para a frente?" },
    ],
    sinais_compra: ["10 ou mais colaboradores", "fechamento de ponto manual ou com erro", "medo de passivo trabalhista ou fiscalização", "equipe em campo ou em mais de uma unidade"],
    sinais_descarte: ["menos de 3 colaboradores e sem plano de crescer", "procura emprego ou quer consultar o próprio ponto", "estudante", "revende sistema de ponto (concorrente)"],
    dores: /fechamento|planilha|papel|relogio (quebr|velho)|erro|hora extra|banco de horas|processo trabalhista|fiscaliza|multa|atestado|ferias venc|retrabalho|demora/,
    palavras: /ponto|colaborador|funcionari|folha|rh\b|ferias|holerite|esocial|hora extra|banco de horas/,
    preco: "Ponto a partir de R$ 9,90 por colaborador (mínimo R$ 149 por mês), mais a implantação",
    material: "resumo dos planos Ponto e RH Completo",
    cadencia: {
      d0: {
        whatsapp: "Oi, {nome}! Aqui é da Nexor. Segue o resumo do Nexor RH + Ponto: ponto pelo app com digital ou rosto do próprio celular, QR Code e GPS, espelho com horas extras e banco de horas, dentro da Portaria 671. {preco}Quer ativar o teste de 30 dias (até 10 colaboradores)?",
        email: { assunto: "Nexor RH + Ponto: o resumo que você pediu", texto: "Olá, {nome}.\n\nSegue o resumo do Nexor RH + Ponto: registro pelo app com biometria do celular, quiosque para quem não tem celular, espelho de ponto, banco de horas, férias, atestados e holerite no app, seguindo a Portaria MTP 671/2021. {preco}\n\nO teste é de 30 dias, sem cartão.\n\nEquipe Nexor" },
      },
      d2: {
        whatsapp: "Oi, {nome}, tudo bem? Uma dúvida que costuma aparecer: o colaborador bate o ponto pelo próprio celular, com digital ou rosto, e o fechamento do mês sai pronto no espelho. Quer ver isso numa demonstração rápida de 30 minutos?",
        email: { assunto: "Como fica o fechamento do ponto no Nexor RH", texto: "Olá, {nome}.\n\nNo Nexor RH, as horas extras, o adicional noturno e o banco de horas já saem calculados no espelho de ponto, e os ajustes são pedidos pelo app. Quer ver numa demonstração de 30 minutos com a {empresa}?\n\nEquipe Nexor" },
      },
      d7: {
        whatsapp: "Oi, {nome}! Passando para saber se ainda faz sentido organizar o ponto e o RH da {empresa}. Se preferir retomar mais para a frente, é só me falar.",
        email: { assunto: "Ainda faz sentido para a {empresa}?", texto: "Olá, {nome}.\n\nSe o controle de ponto ainda estiver nos seus planos, responda este e-mail e marcamos o diagnóstico gratuito. Se não for o momento, sem problema.\n\nEquipe Nexor" },
      },
    },
  },
  {
    id: "contabil",
    nome: "Nexor Contábil: teste grátis e fundadores",
    produto: "Nexor Contábil",
    utm: ["contabil", "contabilidade", "contador", "contadores", "escritorio-contabil"],
    paginas: ["sistema-para-escritorio-de-contabilidade", "contabil"],
    gatilhos: { forte: /nexor contabil/, fraco: /contabil|contabilidade|escritorio de contab|contador|pre-?lancamento|carteira de (clientes|empresas)/ },
    publico:
      "Escritórios de contabilidade e contadores autônomos com 15 ou mais empresas na carteira, que perdem tempo cobrando documentos e digitando lançamentos. Decisor: contador titular ou sócio do escritório.",
    icp: {
      segmentos: /contab|contador|escritorio contabil|bpo financeiro/,
      cnae: ["6920"],
      porte: [{ unidade: "empresas na carteira", minimo: 15, ideal: 40 }],
      decisoresExtra: /\b(contador[a]?|contabilista)\b/,
      autonomoOk: true,
    },
    abertura:
      "Oi! Aqui é a Blue, a assistente de IA da Nexor 😊 Vi que você se interessou pelo Nexor Contábil, que cobra os documentos dos clientes pelo WhatsApp e deixa a IA preparar os pré-lançamentos para o contador conferir.\n\nMe conta: quantas empresas tem na carteira do escritório hoje?",
    perguntas: [
      { sinal: "porte_numero", texto: "Quantas empresas tem na carteira do escritório hoje?" },
      { sinal: "dor", texto: "Onde a equipe perde mais tempo: correr atrás de documento, digitar lançamento ou controlar prazo?" },
      { sinal: "ferramenta_atual", texto: "Qual sistema contábil vocês usam hoje?" },
      { sinal: "urgencia", texto: "Você gostaria de começar ainda neste mês, aproveitando as vagas de fundador?" },
    ],
    sinais_compra: ["carteira com 15 ou mais empresas", "equipe cobrando documento por WhatsApp na mão", "atraso de obrigação ou multa", "interesse no programa de fundadores"],
    sinais_descarte: ["empresa que quer só a própria contabilidade (não é escritório)", "estudante de Ciências Contábeis", "desenvolve sistema contábil (concorrente)"],
    dores: /cobra(r|ndo)? (os )?document|correr atras|documento atrasad|digitar|lancamento|prazo|obrigac|multa|retrabalho|cliente nao manda|fechamento|conciliac/,
    palavras: /contab|contador|escritorio contabil|lancamento|obrigacoes acessorias|carteira de empresas/,
    preco: "planos a partir de R$ 397 por mês (Autônomo, até 40 empresas), mais a implantação; fundadores têm 40% de desconto por 12 meses",
    material: "resumo dos planos do Contábil e as condições do programa de fundadores",
    cadencia: {
      d0: {
        whatsapp: "Oi, {nome}! Aqui é da Nexor. Segue o resumo do Nexor Contábil: régua automática de cobrança de documentos, IA que lê notas e extratos e sugere os pré-lançamentos (sempre conferidos pelo contador) e controle de prazos por cliente. {preco}Quer garantir uma das vagas de fundador?",
        email: { assunto: "Nexor Contábil: resumo e programa de fundadores", texto: "Olá, {nome}.\n\nO Nexor Contábil cobra os documentos do mês por WhatsApp e e-mail, lê notas, extratos e recibos com IA e sugere os pré-lançamentos para o contador conferir, com exportação no layout do sistema que o escritório já usa (compatibilidade confirmada no diagnóstico). {preco}\n\nOs 10 primeiros escritórios entram como fundadores: 40% na mensalidade por 12 meses, 50% na implantação e preço travado por 24 meses.\n\nEquipe Nexor" },
      },
      d2: {
        whatsapp: "Oi, {nome}, tudo bem? No teste do Contábil dá para colocar até 5 empresas da carteira e ver a régua cobrando os documentos de verdade. Quer que a gente monte junto numa conversa de 30 minutos?",
        email: { assunto: "Teste o Contábil com 5 empresas da sua carteira", texto: "Olá, {nome}.\n\nNo teste de 30 dias você coloca até 5 empresas da carteira e vê a cobrança automática de documentos e os pré-lançamentos funcionando. Quer agendar 30 minutos com a equipe para configurar junto?\n\nEquipe Nexor" },
      },
      d7: {
        whatsapp: "Oi, {nome}! As vagas de fundador do Contábil são só 10. Se ainda fizer sentido para o escritório, me avisa que eu reservo um horário com a equipe. Se não for o momento, tudo bem.",
        email: { assunto: "Vagas de fundador do Nexor Contábil", texto: "Olá, {nome}.\n\nSe o Nexor Contábil ainda estiver nos seus planos, responda este e-mail e marcamos o diagnóstico gratuito. Se não for o momento, sem problema.\n\nEquipe Nexor" },
      },
    },
  },
  {
    id: "barber",
    nome: "Nexor Barber: teste grátis e fundadores",
    produto: "Nexor Barber",
    utm: ["barber", "barbearia", "barbearias", "nexor-barber"],
    paginas: ["sistema-para-barbearia", "barber"],
    gatilhos: { forte: /nexor barber/, fraco: /barbearia|barber|barbeiro|corte de cabelo|clube de assinatura/ },
    publico:
      "Barbearias com 1 a 12 barbeiros que agendam pelo WhatsApp ou caderno e querem clube de assinatura, menos faltas e controle de comissão. Decisor: dono da barbearia (muitas vezes também barbeiro).",
    icp: {
      segmentos: /barbearia|barber|barbeiro|salao masculino|cabeleireir/,
      cnae: ["9602"],
      porte: [{ unidade: "barbeiros", minimo: 1, ideal: 3 }],
      autonomoOk: true,
    },
    abertura:
      "Oi! Sou a Blue, a assistente de IA da Nexor 💈 Que bom que você quer testar o Nexor Barber, o app em que o seu cliente agenda o de sempre em um toque.\n\nQuantos barbeiros trabalham aí com você hoje?",
    perguntas: [
      { sinal: "porte_numero", texto: "Quantos barbeiros trabalham com você hoje?" },
      { sinal: "ferramenta_atual", texto: "Hoje a agenda fica no caderno, no WhatsApp ou em algum aplicativo?" },
      { sinal: "dor", texto: "O que mais te incomoda: cliente que falta, buraco na agenda ou controle de comissão e caixa?" },
    ],
    sinais_compra: ["2 ou mais barbeiros", "agenda pelo WhatsApp ou caderno", "quer clube de assinatura", "cliente que falta ou buraco na agenda"],
    sinais_descarte: ["quer só cortar o cabelo (cliente final)", "estudante ou curso de barbeiro", "vende app para barbearia (concorrente)"],
    dores: /falta|faltou|buraco na agenda|agenda (bagunc|cheia|vazia)|comissao|caixa|caderno|esquece|cancel|assinatura|clube|fidelizar/,
    palavras: /barbe|corte|cabelo|navalha|clube de assinatura/,
    preco: "planos a partir de R$ 89 por mês (Solo, 1 barbeiro), mais a implantação; fundadores têm 40% de desconto por 12 meses",
    material: "resumo dos planos Solo, Barbearia e Premium e as condições de fundador",
    cadencia: {
      d0: {
        whatsapp: "Oi, {nome}! Aqui é da Nexor 💈 Segue o resumo do Nexor Barber: app do cliente sem loja, agendamento do de sempre em um toque, clube de assinatura, lista de espera, comanda e comissão por barbeiro. {preco}Quer ativar o teste de 30 dias (até 2 barbeiros)?",
        email: { assunto: "Nexor Barber: o resumo que você pediu", texto: "Olá, {nome}.\n\nO Nexor Barber tem app para o cliente agendar em um toque, clube de assinatura com cobrança recorrente, vaga relâmpago para a lista de espera, lembrete de retorno, comanda, caixa e comissões por barbeiro. {preco}\n\nO teste é de 30 dias, sem cartão.\n\nEquipe Nexor" },
      },
      d2: {
        whatsapp: "Oi, {nome}, tudo bem? Uma coisa que costuma ajudar a barbearia: quando alguém cancela, o Barber avisa a lista de espera e a vaga não fica vazia. Quer ver isso funcionando numa demonstração rápida?",
        email: { assunto: "Menos buraco na agenda da {empresa}", texto: "Olá, {nome}.\n\nQuando um cliente cancela, o Nexor Barber oferece a vaga para quem está na lista de espera, e o lembrete de retorno chama cada cliente no ciclo de corte dele. Quer ver numa demonstração de 30 minutos?\n\nEquipe Nexor" },
      },
      d7: {
        whatsapp: "Oi, {nome}! As vagas de fundador do Barber são limitadas. Se ainda fizer sentido para a {empresa}, me avisa que eu reservo um horário. Se não for agora, sem problema.",
        email: { assunto: "Vagas de fundador do Nexor Barber", texto: "Olá, {nome}.\n\nSe o Nexor Barber ainda estiver nos seus planos, é só responder este e-mail. Se não for o momento, sem problema.\n\nEquipe Nexor" },
      },
    },
  },
  {
    id: "agente",
    nome: "Nexor Agente: IA pessoal do dono",
    produto: "Nexor Agente",
    utm: ["nexor-agente", "agente", "ia-pessoal", "assistente-pessoal"],
    paginas: ["nexor-agente"],
    gatilhos: { forte: /nexor agente|ia pessoal|agente pessoal/, fraco: /pedir (pelo|no) whats|consultar (o )?(erp|sistema) (pelo|no) whats|assistente para o dono|secretaria virtual/ },
    publico:
      "Donos e gestores de pequenas e médias empresas (5 ou mais pessoas) que usam ERP, CRM ou financeiro com API e querem consultar e pedir tarefas pelo WhatsApp, com aprovação. Decisor: o próprio dono ou sócio.",
    icp: {
      segmentos: null,
      cnae: "*",
      porte: [{ unidade: "funcionários", minimo: 5, ideal: 15 }],
    },
    abertura:
      "Oi! Aqui é a Blue, a assistente de IA da Nexor 😊 Vi que você chegou pelo Nexor Agente, a IA pessoal no WhatsApp que consulta e executa tarefas nos sistemas da sua empresa, sempre com a sua aprovação.\n\nMe conta: quais sistemas a empresa usa hoje, tipo ERP, CRM ou financeiro?",
    perguntas: [
      { sinal: "ferramenta_atual", texto: "Quais sistemas a empresa usa hoje (ERP, CRM, financeiro)?" },
      { sinal: "cargo", texto: "Você é o dono ou cuida da gestão da empresa?" },
      { sinal: "dor", texto: "Que tarefa você mais queria pedir pelo WhatsApp em vez de abrir o sistema?" },
      { sinal: "porte_numero", texto: "Quantas pessoas trabalham na empresa?" },
    ],
    sinais_compra: ["dono ou sócio", "usa ERP/CRM/financeiro com API", "quer relatórios e aprovações pelo WhatsApp", "pouco tempo para abrir sistemas"],
    sinais_descarte: ["quer um assistente para a vida pessoal", "não usa nenhum sistema", "estudante", "vende agente de IA (concorrente)"],
    dores: /nao tenho tempo|abrir o sistema|relatorio|aprovar|aprovac|consultar|saber (o )?(faturamento|caixa|estoque)|perco tempo|correria|na rua/,
    palavras: /erp|crm|sistema|relatorio|faturamento|aprovar|consultar/,
    preco: "planos a partir de R$ 497 por mês (Essencial, até 2 sistemas conectados), mais a implantação; fundadores têm 40% de desconto por 12 meses",
    material: "resumo dos planos do Agente e as condições de fundador",
    cadencia: {
      d0: {
        whatsapp: "Oi, {nome}! Aqui é da Nexor. Segue o resumo do Nexor Agente: você pergunta pelo WhatsApp e a IA consulta os sistemas da {empresa} na hora; criar, editar ou apagar só acontece depois que você toca em Aprovar. {preco}Quer ver com os sistemas que vocês usam?",
        email: { assunto: "Nexor Agente: o resumo que você pediu", texto: "Olá, {nome}.\n\nO Nexor Agente é uma IA pessoal no WhatsApp que consulta e executa tarefas nos sistemas da empresa que tenham API. Toda alteração passa pela sua aprovação, só números autorizados dão ordens e tudo fica registrado em auditoria. {preco}\n\nA compatibilidade com cada sistema é confirmada no diagnóstico gratuito.\n\nEquipe Nexor" },
      },
      d2: {
        whatsapp: "Oi, {nome}, tudo bem? Pensei num exemplo: \"quanto entrou ontem e quais boletos vencem hoje?\" e a resposta chega no seu WhatsApp. Quer que a equipe veja se os sistemas da {empresa} conectam?",
        email: { assunto: "Uma pergunta, uma resposta no WhatsApp", texto: "Olá, {nome}.\n\nCom o Nexor Agente, perguntas como \"quanto faturamos esta semana?\" são respondidas no WhatsApp, direto dos sistemas da {empresa}. Quer marcar 30 minutos para a equipe confirmar as integrações?\n\nEquipe Nexor" },
      },
      d7: {
        whatsapp: "Oi, {nome}! Passando para saber se ainda faz sentido ter a IA pessoal no WhatsApp. Se for melhor deixar para depois, é só me avisar.",
        email: { assunto: "Ainda faz sentido para você?", texto: "Olá, {nome}.\n\nSe o Nexor Agente ainda estiver nos seus planos, responda este e-mail e marcamos o diagnóstico. Se não for o momento, sem problema.\n\nEquipe Nexor" },
      },
    },
  },
  {
    id: "elo",
    nome: "Nexor Elo: rede de fornecedores e instaladores",
    produto: "Nexor Elo",
    utm: ["elo", "nexor-elo", "fornecedores", "instaladores", "rede-elo"],
    paginas: ["rede-fornecedores-instaladores", "elo"],
    gatilhos: { forte: /nexor elo|rede (de )?fornecedores|fornecedores e instaladores/, fraco: /\belo\b|instalador|distribuidor de material|split|orcamento com estoque/ },
    publico:
      "Fornecedores (lojas, revendas e distribuidores de segurança eletrônica, elétrica, solar, climatização, telecom e hidráulica) com rede de instaladores, e instaladores que fazem 4 ou mais orçamentos por mês. Foco inicial: Araguari e Triângulo Mineiro. Decisor: dono ou gerente comercial do fornecedor; o próprio instalador.",
    icp: {
      segmentos: /seguranca eletronica|cftv|alarme|eletric|solar|fotovoltai|climatiza|ar condicionado|refrigera|telecom|rede(s)? de dados|hidraul|automacao|material eletrico|instalador|distribuidor|revenda|fornecedor/,
      cnae: ["4321", "4322", "4329", "8020", "3321", "4742", "4744", "4673", "4752", "4649", "4669", "4754"],
      porte: [
        { unidade: "instaladores", minimo: 10, ideal: 30 },
        { unidade: "orçamentos por mês", minimo: 4, ideal: 8 },
      ],
      decisoresExtra: /\b(instalador|tecnico autonomo|autonomo)\b/,
      autonomoOk: true,
    },
    abertura:
      "Oi! Sou a Blue, a assistente de IA da Nexor 😊 Vi que você se interessou pelo Nexor Elo, a rede em que o orçamento do instalador já sai com o estoque do fornecedor e o pagamento cai dividido.\n\nVocê é fornecedor (loja ou distribuidor) ou instalador?",
    perguntas: [
      { sinal: "perfil", texto: "Você é fornecedor (loja ou distribuidor) ou instalador?" },
      { sinal: "segmento", texto: "Qual é o seu ramo: segurança eletrônica, elétrica, solar, climatização ou outro?" },
      { sinal: "porte_numero", texto: "Quantos instaladores compram com você hoje? (ou, se você é instalador: quantos orçamentos faz por mês?)" },
      { sinal: "dor", texto: "O que mais trava hoje: cotar em várias lojas, receber do cliente ou dar crédito para instalador?" },
    ],
    sinais_compra: ["fornecedor com 10 ou mais instaladores", "instalador com 4 ou mais orçamentos por mês", "calote ou venda a prazo para instalador", "Triângulo Mineiro (foco inicial)"],
    sinais_descarte: ["cliente final procurando instalador", "estudante", "marketplace ou software de ordem de serviço (concorrente)"],
    dores: /calote|inadimpl|cotar|cotacao|tres lojas|varias lojas|receber|prazo de 30|credito|comprar (o )?material antes|orcamento em pdf|perco orcamento|margem|estoque parado/,
    palavras: /instalador|fornecedor|distribuidor|orcamento|cftv|solar|eletric|split|material/,
    preco: "fornecedor a partir de R$ 397 por mês (Loja) mais 2,5% só do produto liquidado; instalador grátis ou Pro por R$ 79 por mês",
    material: "resumo dos planos do Elo (fornecedor e instalador) e a simulação de capital de giro",
    cadencia: {
      d0: {
        whatsapp: "Oi, {nome}! Aqui é da Nexor. Segue o resumo do Nexor Elo: o instalador monta o orçamento com o estoque do fornecedor, o cliente final paga pelo link e o dinheiro já cai dividido, sem o fornecedor ver o cliente do instalador. {preco}Quer ver uma simulação com os seus números?",
        email: { assunto: "Nexor Elo: o resumo que você pediu", texto: "Olá, {nome}.\n\nNo Nexor Elo, o orçamento do instalador sai com o estoque reservado do fornecedor, o cliente final paga por Pix, boleto ou cartão e o split divide o valor na hora. A carteira do instalador fica privada. {preco}\n\nSe quiser, montamos uma simulação com os números da {empresa}.\n\nEquipe Nexor" },
      },
      d2: {
        whatsapp: "Oi, {nome}, tudo bem? Uma conta que costuma chamar atenção: quando o cliente paga no link e o split já liquida a compra no fornecedor, ninguém precisa vender a prazo nem correr atrás de calote. Quer que a gente faça essa conta com os seus números?",
        email: { assunto: "Capital de giro e calote: a conta do Elo", texto: "Olá, {nome}.\n\nPreparamos uma simulação de capital de giro e inadimplência para fornecedores e uma de fechamento de propostas para instaladores. São hipóteses, e trocamos pelos números reais da {empresa} numa conversa de 30 minutos. Quer marcar?\n\nEquipe Nexor" },
      },
      d7: {
        whatsapp: "Oi, {nome}! Estamos montando a rede do Elo no Triângulo Mineiro. Se ainda fizer sentido entrar, me avisa que eu marco com a equipe. Se não for agora, sem problema.",
        email: { assunto: "A rede do Nexor Elo está começando", texto: "Olá, {nome}.\n\nSe o Nexor Elo ainda estiver nos seus planos, responda este e-mail e marcamos o diagnóstico. Se não for o momento, sem problema.\n\nEquipe Nexor" },
      },
    },
  },
  {
    id: "ti",
    nome: "Soluções de TI: Service Desk, Cofre e IT Platform",
    produto: "Soluções de TI (Service Desk, Cofre, IT Platform)",
    utm: ["ti", "service-desk", "servicedesk", "helpdesk", "help-desk", "chamados", "cofre", "cofre-de-senhas", "it-platform", "inventario", "inventario-ti"],
    paginas: ["sistema-de-chamados", "inventario-de-ti", "cofre-de-senhas"],
    gatilhos: { forte: /service desk|it platform|cofre de senhas|nexor cofre|inventario de (ti|maquinas|computadores)/, fraco: /help ?desk|chamados|sistema de chamado|glpi|equipe de ti|parque de maquinas|acesso remoto|senhas da empresa/ },
    publico:
      "Empresas com equipe de TI própria ou terceirizada (MSP) que atendem 20 ou mais computadores e querem chamados com SLA, senhas protegidas e inventário automático, tudo no servidor da empresa. Decisor: gerente ou coordenador de TI, diretor administrativo ou dono do MSP.",
    icp: {
      segmentos: null,
      cnae: "*",
      porte: [
        { unidade: "computadores", minimo: 20, ideal: 50 },
        { unidade: "técnicos", minimo: 2, ideal: 4 },
      ],
      decisoresExtra: /\b(cio|cto|head de ti|gerente de ti|coordenador[a]? de ti|supervisor[a]? de ti)\b/,
    },
    abertura:
      "Oi! Aqui é a Blue, a assistente de IA da Nexor 😊 Vi que você chegou pelas soluções para equipes de TI: Service Desk, Cofre de senhas e IT Platform, todas instaladas no servidor da sua empresa.\n\nPara começar: quantos computadores a equipe de TI atende hoje?",
    perguntas: [
      { sinal: "porte_numero", texto: "Quantos computadores a equipe de TI atende hoje?" },
      { sinal: "dor", texto: "O que aperta mais: chamado sem controle, senha espalhada ou não saber o que tem em cada máquina?" },
      { sinal: "ferramenta_atual", texto: "Vocês usam alguma ferramenta hoje, como GLPI, planilha ou outro sistema?" },
      { sinal: "cargo", texto: "Você é da equipe de TI ou da gestão da empresa?" },
    ],
    sinais_compra: ["20 ou mais computadores", "chamados por WhatsApp ou e-mail sem SLA", "senhas em planilha", "auditoria, LGPD ou inventário pedido pela diretoria"],
    sinais_descarte: ["uso doméstico (um computador em casa)", "estudante", "vende software de chamados ou RMM (concorrente)"],
    dores: /chamado (perdido|sem controle)|sem sla|senha (em planilha|espalhad|no post-it)|planilha de senha|nao sei o que tem|inventario|auditoria|antivirus|disco cheio|acesso remoto|perda de controle|whatsapp do suporte/,
    palavras: /chamado|help ?desk|service desk|senha|inventario|computadores|maquinas|ti\b|suporte tecnico|acesso remoto/,
    preco: "Service Desk a partir de R$ 299 por mês (até 5 técnicos), Cofre a partir de R$ 199 e IT Platform a partir de R$ 299 por mês, mais a implantação",
    material: "resumo das três soluções de TI e os preços de entrada",
    cadencia: {
      d0: {
        whatsapp: "Oi, {nome}! Aqui é da Nexor. Segue o resumo das soluções de TI: Service Desk com SLA e painel da gerência, Cofre de senhas com permissões e auditoria, e IT Platform com inventário automático e alertas que viram chamado. Tudo no servidor da {empresa}, sem licenças de terceiros. {preco}Quer ver numa demonstração?",
        email: { assunto: "Soluções de TI da Nexor: o resumo que você pediu", texto: "Olá, {nome}.\n\nNexor Service Desk (chamados com SLA de 4 h a 72 h, filas e painel), Nexor Cofre (senhas com criptografia, pastas por equipe e histórico de acesso) e Nexor IT Platform (inventário automático, alertas, instalação remota e auditoria). Tudo implantado no ambiente da {empresa}. {preco}\n\nEquipe Nexor" },
      },
      d2: {
        whatsapp: "Oi, {nome}, tudo bem? No IT Platform, um alerta como disco cheio ou máquina sem antivírus vira chamado em um clique no Service Desk. Quer que a gente mostre isso com algumas máquinas de teste?",
        email: { assunto: "Do alerta ao chamado em um clique", texto: "Olá, {nome}.\n\nO agente leve do IT Platform levanta hardware, programas e status de cada máquina, e os alertas viram chamado no Service Desk. Quer agendar 30 minutos para ver com a equipe?\n\nEquipe Nexor" },
      },
      d7: {
        whatsapp: "Oi, {nome}! Passando para saber se ainda faz sentido organizar chamados, senhas e inventário da {empresa}. Se for melhor deixar para depois, é só me avisar.",
        email: { assunto: "Ainda faz sentido para a {empresa}?", texto: "Olá, {nome}.\n\nSe as soluções de TI ainda estiverem nos seus planos, responda este e-mail e marcamos o diagnóstico. Se não for o momento, sem problema.\n\nEquipe Nexor" },
      },
    },
  },
  {
    id: "qualquer-cenario",
    nome: "Nexor atende qualquer cenário (diagnóstico)",
    produto: "Diagnóstico Nexor (indica o produto certo)",
    umbrella: true,
    utm: ["qualquer-cenario", "nexor-qualquer-cenario", "nexor-atende-qualquer-cenario", "institucional", "marca", "nexor-geral", "diagnostico"],
    paginas: [],
    gatilhos: { forte: /qualquer cenario/, fraco: /diagnostico gratuito|sistema sob medida|automatizar a empresa/ },
    publico:
      "Empresas de qualquer segmento que ainda não sabem qual solução precisam. A Blue faz o diagnóstico e indica o produto certo (Atende IA, RH + Ponto, Contábil, Barber, Agente, Elo, TI ou um projeto sob medida). Decisor: dono, sócio ou gestor.",
    icp: {
      segmentos: null,
      cnae: "*",
      porte: [{ unidade: "funcionários", minimo: 3, ideal: 10 }],
    },
    abertura:
      "Oi! Sou a Blue, a assistente de IA da Nexor 😊 A Nexor monta tecnologia para qualquer cenário: atendimento com IA, RH e ponto, contabilidade, barbearias, TI, rede de fornecedores e sistemas sob medida.\n\nMe conta: o que você quer resolver primeiro na sua empresa?",
    perguntas: [
      { sinal: "dor", texto: "O que você quer resolver primeiro na empresa?" },
      { sinal: "segmento", texto: "Qual é o ramo da empresa?" },
      { sinal: "porte_numero", texto: "Quantas pessoas trabalham com você?" },
      { sinal: "urgencia", texto: "Isso é para agora ou para os próximos meses?" },
    ],
    sinais_compra: ["dor clara e ligada a um produto", "empresa com 3 ou mais pessoas", "decisor na conversa", "quer o diagnóstico gratuito"],
    sinais_descarte: ["pessoa física sem empresa", "estudante", "concorrente", "pedido sem relação com tecnologia para empresas"],
    dores: /perco|perdendo|nao (dou|damos) conta|retrabalho|planilha|bagunc|sem controle|demora|erro|atraso|sobrecarregad|manual/,
    palavras: /./,
    preco: "o investimento depende do produto indicado no diagnóstico",
    material: "visão geral das soluções da Nexor e o convite para o diagnóstico gratuito",
    cadencia: {
      d0: {
        whatsapp: "Oi, {nome}! Aqui é da Nexor. Pelo que você contou, o que mais combina com a {empresa} é {o_produto}. Quer marcar o diagnóstico gratuito de 30 minutos para a equipe mostrar como ficaria na {empresa}?",
        email: { assunto: "O próximo passo para a {empresa}", texto: "Olá, {nome}.\n\nPelo que você contou à Blue, o que mais combina com a {empresa} é {o_produto}. No diagnóstico gratuito (30 minutos por vídeo) a equipe entende os processos da {empresa} e estima o retorno. Sem compromisso.\n\nEquipe Nexor" },
      },
      d2: {
        whatsapp: "Oi, {nome}, tudo bem? Fiquei pensando no que você contou. Se quiser, te mando um resumo sobre {o_produto} para você avaliar com calma. Pode ser?",
        email: { assunto: "Um resumo para a {empresa}", texto: "Olá, {nome}.\n\nSe preferir avaliar com calma antes de conversar, responda este e-mail que mandamos um resumo sobre {o_produto} pensado para a {empresa}.\n\nEquipe Nexor" },
      },
      d7: {
        whatsapp: "Oi, {nome}! Passando para saber se ainda faz sentido conversar sobre a {empresa}. Se for melhor deixar para depois, é só me avisar.",
        email: { assunto: "Ainda faz sentido para a {empresa}?", texto: "Olá, {nome}.\n\nSe ainda fizer sentido, é só responder e marcamos o diagnóstico gratuito. Se não for o momento, sem problema.\n\nEquipe Nexor" },
      },
    },
  },
];

export const UMBRELLA = CAMPANHAS.find((c) => c.umbrella);
const PRODUTOS = CAMPANHAS.filter((c) => !c.umbrella);

export const campanhaPorId = (id) => CAMPANHAS.find((c) => c.id === id);

/* ---------- Detecção ---------- */

/** O valor (utm_campaign, utm_content...) cita algum apelido da campanha, como palavra inteira? */
function citaApelido(valor, apelidos) {
  const t = tokens(valor);
  if (!t.length) return null;
  const junto = t.join("-");
  for (const apelido of apelidos) {
    const a = tokens(apelido).join("-");
    if (junto === a || junto.startsWith(`${a}-`) || junto.endsWith(`-${a}`) || junto.includes(`-${a}-`)) return apelido;
  }
  return null;
}

function porApelido(valor) {
  if (!valor) return null;
  // Produtos antes da campanha guarda-chuva; apelidos mais longos antes dos curtos ("nexor-agente" antes de "agente")
  let melhor = null;
  for (const c of [...PRODUTOS, UMBRELLA]) {
    const ap = citaApelido(valor, c.utm);
    if (ap && (!melhor || tokens(ap).length > tokens(melhor.ap).length)) melhor = { c, ap };
  }
  return melhor?.c ?? null;
}

/** Campanha pelo texto (primeira mensagem do WhatsApp, anúncio de clique para o WhatsApp). */
export function campanhaPorTexto(texto) {
  const t = norm(texto);
  if (!t.trim()) return null;
  let melhor = null;
  for (const c of PRODUTOS) {
    const pontos = (c.gatilhos.forte.test(t) ? 3 : 0) + (c.gatilhos.fraco.test(t) ? 1 : 0);
    if (pontos && (!melhor || pontos > melhor.pontos)) melhor = { c, pontos };
  }
  if (!melhor && UMBRELLA.gatilhos.forte.test(t)) return UMBRELLA;
  return melhor?.c ?? null;
}

/**
 * Descobre a campanha de uma conversa.
 * Ordem: utm_campaign, utm_content, utm_source, anúncio de clique para o WhatsApp, página do site, texto.
 * Sem nada, cai na campanha "Nexor atende qualquer cenário", que faz o diagnóstico.
 * @returns {{campanha: object, id: string, via: string}}
 */
export function detectarCampanha({ origem = {}, texto = "", referral } = {}) {
  const achou = (c, via) => ({ campanha: c, id: c.id, via });
  for (const via of ["utm_campaign", "utm_content", "utm_source"]) {
    const c = porApelido(origem?.[via]);
    if (c) return achou(c, via);
  }
  if (referral) {
    const c = campanhaPorTexto(`${referral.headline ?? ""} ${referral.body ?? ""}`);
    if (c) return achou(c, "anuncio_whatsapp");
    try {
      const u = new URL(referral.source_url ?? "");
      const c2 = porApelido(u.searchParams.get("utm_campaign")) ?? porApelido(u.searchParams.get("utm_content"));
      if (c2) return achou(c2, "anuncio_whatsapp");
    } catch {
      /* sem URL */
    }
  }
  if (origem?.pagina) {
    let caminho = "";
    try {
      caminho = new URL(origem.pagina, "https://x").pathname;
    } catch {
      caminho = String(origem.pagina);
    }
    const partes = tokens(caminho.replace(/\//g, " / ")).join("-");
    const c = PRODUTOS.find((p) => p.paginas.some((slug) => `-${partes}-`.includes(`-${tokens(slug).join("-")}-`)));
    if (c) return achou(c, "pagina");
  }
  const c = campanhaPorTexto(texto);
  if (c) return achou(c, "texto");
  return achou(UMBRELLA, "padrao");
}

/** Bloco de contexto que a Blue recebe na primeira mensagem da conversa. */
export function contextoCampanha(campanha, { mostrarPreco = false } = {}) {
  const linhas = [
    `<campanha id="${campanha.id}">`,
    `Campanha: ${campanha.nome}`,
    `Produto: ${campanha.produto}`,
    `Público (ICP): ${campanha.publico}`,
    `Abertura sugerida (adapte ao que a pessoa escreveu, sem copiar se ela já disse algo): ${campanha.abertura.replace(/\n+/g, " ")}`,
    `Perguntas de qualificação (no máximo estas, uma por vez, só as que ainda não foram respondidas):`,
    ...campanha.perguntas.map((p, i) => `${i + 1}. ${p.texto}`),
    `Sinais de compra: ${campanha.sinais_compra.join("; ")}.`,
    `Sinais de descarte: ${campanha.sinais_descarte.join("; ")}.`,
    `Material para quem só quer preço: ${campanha.material}.`,
  ];
  if (mostrarPreco) linhas.push(`Preço de referência que você pode citar: ${campanha.preco}. Diga que a proposta final sai no diagnóstico.`);
  linhas.push("</campanha>");
  return linhas.join("\n");
}
