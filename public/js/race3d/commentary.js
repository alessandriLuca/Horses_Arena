// La telecronaca di Nonna Pina: legge gli eventi della simulazione e li racconta,
// con l'umorismo della Sagra, in 6 lingue.

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? "") + "");

const L = {
  it: {
    intro: [
      "Buonasera da {venue}! {dist} metri su terreno {going}, tempo: {weather}. Mettetevi comodi, che la nonna ha portato i taralli.",
      "Eccoci a {venue}! Corsa sui {dist} metri, terreno {going}. Io ho scommesso cinque euro, non ditelo al nonno.",
      "Benvenuti a {venue}! {n} cavalli, {dist} metri e una nonna con la pressione già alta. Si parte!",
    ],
    favorite: ["Occhio a {a}: è il favorito. Ma anche mio cugino era favorito alle elezioni, e guardate com'è finita.", "Il favorito è {a}. Bello, eh? Sembra il nonno da giovane."],
    ready: ["Cavalli nelle gabbie... silenzio in tribuna!", "Tutti pronti? Anche tu, che stai mangiando le patatine?"],
    start: ["E PARTITI! Come le mie amiche al mercato quando aprono i saldi!", "VIA! Si parte! Correte, che il sugo si fredda!", "Partiti! Che Sant'Antonio ce la mandi buona!"],
    badStart: ["{a} è partito con calma, come il treno regionale.", "{a} si è svegliato in ritardo. Come mio nipote la domenica."],
    lead: ["In testa adesso c'è {a}!", "{a} prende il comando! Brava bestia!", "Comanda {a}. Ma la strada è lunga, eh."],
    surge: ["Guardate {a}! Sta risalendo come il prezzo della benzina!", "{a} recupera posizioni! Ha mangiato bene stamattina."],
    bump: ["Contatto tra {a} e {b}! Ma che modi, ragazzi!", "{a} spinge {b}! Neanche alla fila delle poste!", "Spallata di {a} su {b}. Mamma mia, che maleducati."],
    stumble: ["{a} inciampa! Attenzione!", "Oh! {a} mette male una zampa!", "{a} incespica... come lo zio dopo il terzo bicchiere."],
    fall: ["CADUTO! {a} è a terra! Madonna santa!", "Oh no, è caduto {a}! Chiamate il veterinario! E pure il prete!", "{a} va giù! Spero non si sia fatto male, povera creatura."],
    rear: ["{a} si impenna! Ma che fai, il cavallo di Napoleone?", "{a} si alza sulle zampe di dietro! Scendi, che cadi!"],
    stop: ["{a} si è fermato! Ma che gli prende?", "{a} si pianta in mezzo alla pista. Pure lui sciopera?"],
    spook: ["{a} si spaventa! Di cosa poi... boh.", "Scarto improvviso di {a}! Avrà visto un fantasma."],
    quirk: ["{a} {x}!", "Guardate {a}: {x}!", "Ma l'avete visto? {a} {x}!"],
    exhausted: ["{a} è senza benzina! Ha corso troppo all'inizio.", "{a} cala vistosamente. Ha il fiato corto come me sulle scale."],
    kick: ["{a} lancia lo sprint!", "Ora {a} accelera! Si fa sul serio!"],
    hurdle_fall: ["{a} cade sulla siepe! Che botta!", "Si schianta sulla siepe {a}!"],
    refuse: ["{a} rifiuta l'ostacolo! Non ci vuole saltare, come io non voglio salire sul pullman.", "{a} si pianta davanti alla siepe. Testardo!"],
    hurdle_clip: ["{a} tocca la siepe ma resta in piedi!", "{a} si porta via mezza siepe!"],
    leap: ["{a} salta il cavallo a terra! Che riflessi!"],
    hitman: ["Ma chi è quel losco figuro a bordo pista?! C'è un sicario! Ce l'ha con {a}!", "Un tizio col cappello nero vicino alla pista... Ci siamo, è un sabotaggio contro {a}!"],
    hit_buccia: ["Ha lanciato una buccia di banana in pista! Ma che gente!"],
    hit_olio: ["Olio in pista! Neanche nella friggitrice della sagra!"],
    hit_corda: ["Una corda tesa sulla pista! Delinquenti!"],
    hit_invasore: ["Un invasore di pista! Un tifoso corre davanti ai cavalli! Fermatelo!"],
    hit_petardo: ["BOOM! Un petardo! Mi è caduta la dentiera!"],
    hit_laser: ["Un laser negli occhi di {a}! Vergognatevi!"],
    hit_drone: ["Un drone sopra la pista! Ma siamo matti?!"],
    hit_fischietto: ["Un fischio strano... {a} impazzisce!"],
    caught: ["La sicurezza ferma un losco figuro a bordo pista! Bravi ragazzi!", "Preso! Le guardie hanno bloccato un sabotatore!"],
    hazard: ["{a} ci finisce sopra! Scivolone!", "{a} non lo vede e ci passa sopra!"],
    avoid: ["{a} lo evita per un pelo!"],
    riderless: ["{a} corre senza fantino! Scosso! Non conterà all'arrivo, ma che grinta."],
    m1000: ["Mille metri al traguardo! In testa c'è {a}, poi {b} e {c}.", "Ai mille: {a} davanti, {b} lo tallona, {c} terzo."],
    m600: ["Seicento metri! Comincia a farsi dura.", "Seicento dal traguardo, mettetevi gli occhiali!"],
    m400: ["Quattrocento metri! In testa {a}! Ma {b} non molla!", "Ultima curva... rettilineo! {a} davanti a {b}!"],
    m200: ["Duecento metri! {a}! {b}! Che finale!", "Ultimi duecento! Il cuore della nonna non regge!"],
    m100: ["Cento metri! {a}! {a}! {a}!", "Arriva {a}! Arriva {a}!"],
    positions: ["Allora, la situazione: {a} in testa, poi {b}, e {c} terzo.", "Facciamo il punto come al telegiornale: comanda {a}, seguono {b} e {c}.", "{a} davanti, {b} secondo. Più dietro {last}, che se la prende comoda."],
    idle: ["Ai miei tempi i cavalli tiravano il carretto, altro che corse!", "Che belli tutti questi cavalli. Il nonno li avrebbe fatti diventare salame.", "Qualcuno ha visto i miei occhiali? Ah no, li ho in testa.", "Il fantino del {a} è proprio un bel giovanotto. È sposato?", "Mangiate qualcosa, che a vedere le corse si consuma!"],
    photo: ["FOTOFINISH! Non si capisce niente! Datemi gli occhiali!", "Arrivo al fotofinish tra {a} e {b}! Mamma mia!"],
    winner: ["HA VINTO {a}!!! Portategli la porchetta!", "Vince {a}! Lo dicevo io che era il mio preferito!", "{a} trionfa! Che cavallo, che cavallo!"],
    second: ["Secondo {b}, terzo {c}. Bravi tutti, ma soprattutto il primo."],
    dq: ["Squalificato {a} per doping! Vergogna! Alla nonna basta un caffè!"],
    last: ["E ultimo {a}... l'importante è partecipare. Dicono."],
  },
  en: {
    intro: ["Good evening from {venue}! {dist} metres, going {going}, weather: {weather}. Grandma brought snacks.", "Welcome to {venue}! {n} horses, {dist} metres and a grandma with high blood pressure already!"],
    favorite: ["Watch out for {a}: the favourite. My cousin was a favourite once too, and look how that ended."],
    ready: ["Horses in the gates... quiet in the stands!", "Everyone ready? You too, munching those crisps?"],
    start: ["AND THEY'RE OFF! Like my friends at the market when the sales open!", "GO! Run, the pasta is getting cold!"],
    badStart: ["{a} starts slowly, like the regional train."],
    lead: ["{a} takes the lead!", "Now {a} is in front! Good boy!"],
    surge: ["Look at {a}! Climbing like petrol prices!"],
    bump: ["Contact between {a} and {b}! What manners!", "{a} shoves {b}! Worse than the queue at the post office!"],
    stumble: ["{a} stumbles! Careful!", "{a} wobbles like uncle after the third glass."],
    fall: ["DOWN! {a} has fallen! Holy Mother!", "Oh no, {a} is down! Call the vet! And the priest!"],
    rear: ["{a} rears up! Who do you think you are, Napoleon's horse?"],
    stop: ["{a} has stopped! Is he on strike too?"],
    spook: ["{a} gets spooked! Must have seen a ghost."],
    quirk: ["Look at {a}: {x}!", "{a}... {x}! I can't believe it!"],
    exhausted: ["{a} is out of fuel! Ran too hard too early."],
    kick: ["{a} kicks for home!"],
    hurdle_fall: ["{a} crashes at the hurdle!"],
    refuse: ["{a} refuses the hurdle! Stubborn as a mule!"],
    hurdle_clip: ["{a} clips the hurdle but stays up!"],
    leap: ["{a} leaps over the fallen horse! What reflexes!"],
    hitman: ["Who is that shady man by the rail?! A hitman! He's after {a}!"],
    hit_buccia: ["He threw a banana peel on the track!"], hit_olio: ["Oil on the track!"], hit_corda: ["A rope across the track! Criminals!"],
    hit_invasore: ["A pitch invader! Stop him!"], hit_petardo: ["BOOM! A firecracker! My dentures fell out!"], hit_laser: ["A laser in {a}'s eyes! Shame!"],
    hit_drone: ["A drone over the track! Are we mad?!"], hit_fischietto: ["A strange whistle... {a} goes crazy!"],
    caught: ["Security stops a shady man by the rail! Well done, boys!"],
    hazard: ["{a} runs right over it! Slip!"], avoid: ["{a} dodges it by a whisker!"],
    riderless: ["{a} is running without a jockey! Won't count, but what spirit!"],
    m1000: ["A thousand to go! {a} leads, then {b} and {c}."], m600: ["Six hundred to go! It's getting tough."],
    m400: ["Four hundred! {a} in front! {b} won't give up!"], m200: ["Two hundred! {a}! {b}! What a finish!"], m100: ["A hundred! {a}! {a}! {a}!"],
    positions: ["Here's the order: {a} leads, then {b}, {c} third.", "{a} in front, {b} second. Way back, {last} is taking it easy."],
    idle: ["In my day horses pulled carts, not this nonsense!", "Has anyone seen my glasses? Oh, they're on my head.", "Eat something, watching races burns calories!"],
    photo: ["PHOTO FINISH! I can't see a thing! Give me my glasses!"],
    winner: ["{a} WINS!!! Bring him a roast pork sandwich!", "{a} wins! I told you he was my favourite!"],
    second: ["{b} second, {c} third. Well done everyone, but mostly the winner."],
    dq: ["{a} disqualified for doping! Shame! Grandma only needs a coffee!"],
    last: ["And {a} last... it's the taking part that counts. So they say."],
  },
  de: {
    intro: ["Guten Abend aus {venue}! {dist} Meter, Boden {going}, Wetter: {weather}. Oma hat Kekse mitgebracht.", "Willkommen in {venue}! {n} Pferde, {dist} Meter und eine Oma mit Bluthochdruck!"],
    favorite: ["Achtung auf {a}: der Favorit. Mein Cousin war auch mal Favorit, und schaut, wie das ausging."],
    ready: ["Pferde in der Startbox... Ruhe auf der Tribüne!"],
    start: ["UND LOS! Wie meine Freundinnen beim Schlussverkauf!", "LOS! Lauft, die Pasta wird kalt!"],
    badStart: ["{a} startet gemütlich, wie der Regionalzug."],
    lead: ["{a} übernimmt die Führung!", "Jetzt führt {a}!"],
    surge: ["Schaut euch {a} an! Steigt wie die Benzinpreise!"],
    bump: ["Kontakt zwischen {a} und {b}! Was für Manieren!"],
    stumble: ["{a} stolpert! Vorsicht!"], fall: ["GESTÜRZT! {a} liegt am Boden! Ruft den Tierarzt!"],
    rear: ["{a} steigt! Bist du Napoleons Pferd?"], stop: ["{a} bleibt stehen! Streikt er auch?"], spook: ["{a} erschrickt! Hat wohl ein Gespenst gesehen."],
    quirk: ["Schaut {a} an: {x}!"], exhausted: ["{a} hat keinen Sprit mehr!"], kick: ["{a} startet den Schlussspurt!"],
    hurdle_fall: ["{a} stürzt am Hindernis!"], refuse: ["{a} verweigert das Hindernis! Stur wie ein Esel!"], hurdle_clip: ["{a} streift das Hindernis!"],
    leap: ["{a} springt über das gestürzte Pferd!"],
    hitman: ["Wer ist dieser zwielichtige Typ an der Bahn?! Ein Auftragskiller! Er will {a}!"],
    hit_buccia: ["Eine Bananenschale auf der Bahn!"], hit_olio: ["Öl auf der Bahn!"], hit_corda: ["Ein gespanntes Seil! Verbrecher!"],
    hit_invasore: ["Ein Flitzer auf der Bahn!"], hit_petardo: ["BUMM! Ein Böller! Mein Gebiss ist rausgefallen!"], hit_laser: ["Ein Laser in den Augen von {a}!"],
    hit_drone: ["Eine Drohne über der Bahn!"], hit_fischietto: ["Ein seltsamer Pfiff... {a} dreht durch!"],
    caught: ["Die Security schnappt einen Saboteur! Bravo!"], hazard: ["{a} läuft direkt drüber!"], avoid: ["{a} weicht knapp aus!"],
    riderless: ["{a} läuft ohne Jockey weiter!"],
    m1000: ["Noch tausend Meter! {a} vorne, dann {b} und {c}."], m600: ["Noch sechshundert!"], m400: ["Vierhundert! {a} vorne! {b} gibt nicht auf!"],
    m200: ["Zweihundert! {a}! {b}! Was für ein Finale!"], m100: ["Hundert! {a}! {a}!"],
    positions: ["Der Stand: {a} vorne, dann {b}, {c} Dritter."], idle: ["Zu meiner Zeit zogen Pferde Karren!", "Hat jemand meine Brille gesehen?"],
    photo: ["FOTOFINISH! Gebt mir meine Brille!"], winner: ["{a} GEWINNT!!! Bringt ihm einen Schweinebraten!"], second: ["{b} Zweiter, {c} Dritter."],
    dq: ["{a} wegen Dopings disqualifiziert! Schande!"], last: ["Und {a} Letzter... dabei sein ist alles."],
  },
  ru: {
    intro: ["Добрый вечер из {venue}! {dist} метров, грунт {going}, погода: {weather}. Бабушка принесла пирожки!", "Добро пожаловать в {venue}! {n} лошадей и бабушка с давлением!"],
    favorite: ["Следите за {a}: фаворит. Мой кузен тоже был фаворитом, и чем всё кончилось?"],
    ready: ["Лошади в боксах... тишина на трибунах!"], start: ["СТАРТ! Как мои подружки на распродаже!", "Поехали! Бегите, макароны стынут!"],
    badStart: ["{a} стартует медленно, как электричка."], lead: ["{a} выходит вперёд!", "Лидирует {a}!"], surge: ["Смотрите на {a}! Растёт, как цены на бензин!"],
    bump: ["Контакт между {a} и {b}! Какие манеры!"], stumble: ["{a} спотыкается!"], fall: ["ПАДЕНИЕ! {a} на земле! Зовите ветеринара!"],
    rear: ["{a} встаёт на дыбы!"], stop: ["{a} остановился! Бастует, что ли?"], spook: ["{a} испугался! Наверное, привидение."],
    quirk: ["Смотрите на {a}: {x}!"], exhausted: ["У {a} кончился бензин!"], kick: ["{a} начинает финишный рывок!"],
    hurdle_fall: ["{a} падает на препятствии!"], refuse: ["{a} отказывается прыгать! Упрямый, как осёл!"], hurdle_clip: ["{a} задевает препятствие!"],
    leap: ["{a} перепрыгивает через упавшую лошадь!"], hitman: ["Кто этот подозрительный тип у бровки?! Киллер! Он охотится на {a}!"],
    hit_buccia: ["Банановая кожура на дорожке!"], hit_olio: ["Масло на дорожке!"], hit_corda: ["Натянутая верёвка! Бандиты!"], hit_invasore: ["Болельщик выбежал на дорожку!"],
    hit_petardo: ["БАХ! Петарда! У меня челюсть выпала!"], hit_laser: ["Лазер в глаза {a}!"], hit_drone: ["Дрон над дорожкой!"], hit_fischietto: ["Странный свист... {a} сходит с ума!"],
    caught: ["Охрана поймала диверсанта! Молодцы!"], hazard: ["{a} наступает прямо на это!"], avoid: ["{a} чудом уворачивается!"], riderless: ["{a} бежит без жокея!"],
    m1000: ["Тысяча метров до финиша! Впереди {a}, за ним {b} и {c}."], m600: ["Шестьсот метров!"], m400: ["Четыреста! {a} впереди! {b} не сдаётся!"],
    m200: ["Двести! {a}! {b}! Какой финиш!"], m100: ["Сто! {a}! {a}!"], positions: ["Расклад: {a} впереди, затем {b}, {c} третий."],
    idle: ["В моё время лошади возили телеги!", "Кто-нибудь видел мои очки?"], photo: ["ФОТОФИНИШ! Дайте мои очки!"],
    winner: ["ПОБЕЖДАЕТ {a}!!!", "{a} побеждает! Я же говорила, мой любимчик!"], second: ["Второй {b}, третий {c}."], dq: ["{a} дисквалифицирован за допинг! Позор!"],
    last: ["А {a} последний... главное — участие."],
  },
  ja: {
    intro: ["{venue}からこんばんは！{dist}メートル、馬場は{going}、天気は{weather}。おばあちゃんはお菓子を持ってきたよ。", "{venue}へようこそ！{n}頭の馬と、血圧の高いおばあちゃんです！"],
    favorite: ["{a}に注目！本命よ。でも私のいとこも本命だったけど、ねえ…"], ready: ["ゲートイン…スタンドは静かに！"],
    start: ["スタート！バーゲンに走る私の友達みたい！", "行け！パスタが冷めちゃうよ！"], badStart: ["{a}はゆっくりスタート、各駅停車みたい。"],
    lead: ["{a}が先頭に立った！", "今は{a}がリード！"], surge: ["{a}を見て！ガソリン価格みたいに上がってくる！"],
    bump: ["{a}と{b}が接触！なんて乱暴な！"], stumble: ["{a}がつまずいた！"], fall: ["落馬！{a}が倒れた！獣医さんを呼んで！"],
    rear: ["{a}が立ち上がった！ナポレオンの馬のつもり？"], stop: ["{a}が止まった！ストライキ？"], spook: ["{a}が驚いた！おばけでも見たのかな。"],
    quirk: ["{a}を見て：{x}！"], exhausted: ["{a}はガス欠！"], kick: ["{a}がスパート！"], hurdle_fall: ["{a}が障害で転倒！"],
    refuse: ["{a}が障害を拒否！頑固ね！"], hurdle_clip: ["{a}が障害に接触！"], leap: ["{a}が倒れた馬を飛び越えた！"],
    hitman: ["柵のそばの怪しい男は誰？！殺し屋よ！{a}を狙ってる！"], hit_buccia: ["バナナの皮が投げ込まれた！"], hit_olio: ["コースに油が！"], hit_corda: ["ロープが張られた！悪党め！"],
    hit_invasore: ["乱入者だ！止めて！"], hit_petardo: ["ドカン！爆竹！入れ歯が落ちた！"], hit_laser: ["{a}の目にレーザー！"], hit_drone: ["コースの上にドローン！"], hit_fischietto: ["変な笛の音…{a}がパニック！"],
    caught: ["警備員が怪しい男を捕まえた！えらい！"], hazard: ["{a}が踏んでしまった！"], avoid: ["{a}が間一髪でかわした！"], riderless: ["{a}は騎手なしで走ってる！"],
    m1000: ["残り1000メートル！先頭は{a}、続いて{b}と{c}。"], m600: ["残り600！"], m400: ["残り400！{a}が先頭！{b}も粘る！"], m200: ["残り200！{a}！{b}！すごい！"], m100: ["残り100！{a}！{a}！"],
    positions: ["順位は：{a}が先頭、{b}、{c}が3番手。"], idle: ["昔は馬は荷車を引いてたのよ！", "誰か私の眼鏡を見なかった？"],
    photo: ["写真判定！眼鏡をちょうだい！"], winner: ["{a}の勝利！！！", "{a}が勝った！やっぱり私のお気に入り！"], second: ["2着は{b}、3着は{c}。"],
    dq: ["{a}はドーピングで失格！恥ずかしい！"], last: ["そして{a}は最下位…参加することに意義がある、らしいわ。"],
  },
  zh: {
    intro: ["来自{venue}的晚上好！{dist}米，场地{going}，天气{weather}。奶奶带了零食！", "欢迎来到{venue}！{n}匹马，还有一个血压已经很高的奶奶！"],
    favorite: ["注意{a}：大热门。我表哥以前也是热门，结果呢……"], ready: ["马匹进闸……看台安静！"],
    start: ["出发了！就像我的朋友们冲进打折商场！", "跑啊！面条要凉了！"], badStart: ["{a}起步很慢，像慢车一样。"],
    lead: ["{a}领先了！", "现在是{a}领跑！"], surge: ["看{a}！像油价一样往上涨！"], bump: ["{a}和{b}发生碰撞！太没礼貌了！"],
    stumble: ["{a}绊了一下！"], fall: ["摔倒了！{a}倒地！快叫兽医！"], rear: ["{a}前腿腾空！你以为你是拿破仑的马吗？"], stop: ["{a}停下了！它也罢工吗？"],
    spook: ["{a}受惊了！大概看到鬼了。"], quirk: ["看{a}：{x}！"], exhausted: ["{a}没油了！"], kick: ["{a}开始冲刺！"],
    hurdle_fall: ["{a}在障碍处摔倒！"], refuse: ["{a}拒绝跳栏！倔得像头驴！"], hurdle_clip: ["{a}碰到了障碍！"], leap: ["{a}跳过了倒地的马！"],
    hitman: ["栏杆边那个可疑的人是谁？！杀手！他盯上了{a}！"], hit_buccia: ["有人扔了香蕉皮！"], hit_olio: ["跑道上有油！"], hit_corda: ["跑道上拉了绳子！坏蛋！"],
    hit_invasore: ["有人闯入跑道！拦住他！"], hit_petardo: ["砰！鞭炮！我的假牙掉了！"], hit_laser: ["激光照{a}的眼睛！"], hit_drone: ["跑道上空有无人机！"], hit_fischietto: ["奇怪的哨声……{a}疯了！"],
    caught: ["保安抓住了破坏者！干得好！"], hazard: ["{a}踩了上去！"], avoid: ["{a}险险躲开！"], riderless: ["{a}没有骑师还在跑！"],
    m1000: ["还剩一千米！{a}领先，然后是{b}和{c}。"], m600: ["还剩六百米！"], m400: ["四百米！{a}领先！{b}不放弃！"], m200: ["两百米！{a}！{b}！太精彩了！"], m100: ["一百米！{a}！{a}！"],
    positions: ["目前：{a}领先，{b}第二，{c}第三。"], idle: ["我年轻的时候马是拉车的！", "有人看见我的眼镜吗？"], photo: ["照片判定！把眼镜给我！"],
    winner: ["{a}赢了！！！", "{a}获胜！我就说它是我的最爱！"], second: ["第二名{b}，第三名{c}。"], dq: ["{a}因兴奋剂被取消资格！丢人！"], last: ["{a}最后一名……重在参与嘛。"],
  },
};

const GOING = {
  it: { secco: "secco", buono: "buono", morbido: "morbido", pesante: "pesante" },
  en: { secco: "firm", buono: "good", morbido: "soft", pesante: "heavy" },
  de: { secco: "fest", buono: "gut", morbido: "weich", pesante: "schwer" },
  ru: { secco: "сухой", buono: "хороший", morbido: "мягкий", pesante: "тяжёлый" },
  ja: { secco: "良", buono: "稍重", morbido: "重", pesante: "不良" },
  zh: { secco: "干", buono: "好", morbido: "软", pesante: "重" },
};
const WEATHER = {
  it: { sole: "sole", nuvoloso: "nuvoloso", vento: "vento forte", pioggia: "pioggia", temporale: "temporale", nebbia: "nebbia", neve: "neve" },
  en: { sole: "sunny", nuvoloso: "cloudy", vento: "windy", pioggia: "rain", temporale: "thunderstorm", nebbia: "fog", neve: "snow" },
  de: { sole: "sonnig", nuvoloso: "bewölkt", vento: "windig", pioggia: "Regen", temporale: "Gewitter", nebbia: "Nebel", neve: "Schnee" },
  ru: { sole: "солнечно", nuvoloso: "облачно", vento: "ветрено", pioggia: "дождь", temporale: "гроза", nebbia: "туман", neve: "снег" },
  ja: { sole: "晴れ", nuvoloso: "曇り", vento: "強風", pioggia: "雨", temporale: "雷雨", nebbia: "霧", neve: "雪" },
  zh: { sole: "晴", nuvoloso: "多云", vento: "大风", pioggia: "雨", temporale: "雷雨", nebbia: "雾", neve: "雪" },
};

export function goingName(id, lang) { return (GOING[lang] ?? GOING.it)[id] ?? id; }
export function weatherName(id, lang) { return (WEATHER[lang] ?? WEATHER.it)[id] ?? id; }

const MOOD = {
  start: "proud", lead: "happy", surge: "sly", bump: "angry", stumble: "shock", fall: "shock", rear: "shock", stop: "shock",
  spook: "shock", quirk: "sly", exhausted: "sly", hurdle_fall: "shock", refuse: "angry", hitman: "angry", caught: "proud",
  hazard: "shock", riderless: "shock", photo: "shock", winner: "yell", dq: "angry", m100: "yell", m200: "yell",
};
const PRIO = { fall: 3, hitman: 3, winner: 3, photo: 3, m100: 3, m200: 2, start: 3, caught: 2, hazard: 2, riderless: 2, hurdle_fall: 3, refuse: 2, quirk: 1.5, lead: 1.5, dq: 3 };

export class Commentary {
  constructor(replay, info, lang, hooks) {
    this.rep = replay;
    this.info = info || {};
    this.lang = L[lang] ? lang : "it";
    this.T = L[this.lang];
    this.hooks = hooks;
    this.events = replay.events.slice().sort((a, b) => a.t - b.t);
    this.ptr = 0;
    this.lastLine = -99;
    this.lastPositions = 0;
    this.marks = new Set();
    this.introDone = false;
    this.readyDone = false;
    this.leadCount = 0;
    this.quirkSeen = new Set();
    this.finished = false;
  }

  name(i) {
    return this.rep.horses[i]?.name ?? "?";
  }

  line(key, vars, i = -1, t = 0) {
    const arr = this.T[key] ?? L.it[key];
    if (!arr) return;
    const text = fill(pick(arr), vars);
    this.lastLine = t;
    this.hooks.say(text, MOOD[key] ?? "happy", PRIO[key] ?? 1);
    if (i >= 0) this.hooks.focus?.(i, t);
  }

  /** Salta in avanti senza commentare (es. si entra a gara iniziata). */
  seek(t) {
    while (this.ptr < this.events.length && this.events[this.ptr].t < t - 1.5) this.ptr++;
  }

  tick(t, states, order) {
    const vn = this.info.venueName ?? this.rep.venue;
    if (t < -12 && !this.introDone) {
      this.introDone = true;
      this.line("intro", { venue: vn, dist: this.rep.distance, going: goingName(this.rep.going, this.lang), weather: weatherName(this.rep.weather, this.lang), n: this.rep.horses.length }, -1, t);
      if (this.info.favorite != null) setTimeout(() => this.hooks.say(fill(pick(this.T.favorite), { a: this.name(this.info.favorite) }), "sly", 1), 7000);
    }
    if (t > -4 && t < 0 && !this.readyDone) {
      this.readyDone = true;
      this.line("ready", {}, -1, t);
    }
    // eventi della simulazione
    while (this.ptr < this.events.length && this.events[this.ptr].t <= t) {
      const e = this.events[this.ptr++];
      if (t - e.t > 3) continue;
      this.event(e, t, order);
    }
    if (t <= 0 || this.finished) return;
    // passaggi ai metri
    const lead = order[0];
    const rem = this.rep.distance - states[lead].p;
    const v = { a: this.name(order[0]), b: this.name(order[1] ?? order[0]), c: this.name(order[2] ?? order[0]), last: this.name(order[order.length - 1]) };
    for (const [m, key] of [[1000, "m1000"], [600, "m600"], [400, "m400"], [200, "m200"], [100, "m100"]]) {
      if (rem <= m && rem > m - 60 && !this.marks.has(m) && this.rep.distance > m + 150) {
        this.marks.add(m);
        this.line(key, v, -1, t);
        return;
      }
    }
    // punto della situazione e chiacchiere
    if (t - this.lastLine > 9 && t - this.lastPositions > 16 && rem > 250) {
      this.lastPositions = t;
      this.line("positions", v, -1, t);
    } else if (t - this.lastLine > 13 && rem > 500) {
      this.line("idle", v, -1, t);
    }
  }

  event(e, t, order) {
    const a = e.a !== undefined ? this.name(e.a) : "";
    const b = e.b !== undefined ? this.name(e.b) : "";
    switch (e.k) {
      case "start": return this.line("start", {}, -1, t);
      case "lead":
        this.leadCount++;
        if (this.leadCount > 1 && t - this.lastLine < 3) return;
        return this.line("lead", { a }, -1, t);
      case "surge": if (t - this.lastLine > 4) this.line("surge", { a }, e.a, t); return;
      case "bump": if ((e.v ?? 0) > 0.7 && t - this.lastLine > 3) this.line("bump", { a, b }, e.a, t); return;
      case "stumble": if ((e.v ?? 0) > 0.4 && t - this.lastLine > 2.5) this.line("stumble", { a }, e.a, t); return;
      case "fall": return this.line("fall", { a }, e.a, t);
      case "rear": return this.line("rear", { a }, e.a, t);
      case "stop": if (t - this.lastLine > 2) this.line("stop", { a }, e.a, t); return;
      case "spook": if (t - this.lastLine > 4) this.line("spook", { a }, e.a, t); return;
      case "quirk": {
        const key = e.a + ":" + e.q;
        if (this.quirkSeen.has(key)) return;
        this.quirkSeen.add(key);
        this.hooks.quirk?.(e);
        let x = e.x ?? "";
        if (this.lang !== "it") x = this.hooks.quirkName?.(e.q) ?? e.q;
        if (b && this.lang === "it" && /( di| a| con| da)$/.test(x)) x += " " + b;
        return this.line("quirk", { a, x }, e.a, t);
      }
      case "exhausted": if (t - this.lastLine > 4 && (e.v ?? 0) > 150) this.line("exhausted", { a }, -1, t); return;
      case "kick": return;
      case "hurdle_fall": return this.line("hurdle_fall", { a }, e.a, t);
      case "refuse": return this.line("refuse", { a }, e.a, t);
      case "hurdle_clip": if (t - this.lastLine > 3) this.line("hurdle_clip", { a }, e.a, t); return;
      case "leap": return this.line("leap", { a }, e.a, t);
      case "hitman":
        this.line("hitman", { a }, e.a, t);
        setTimeout(() => this.line("hit_" + e.x, { a }, -1, t), 2600);
        return;
      case "caught": return this.line("caught", { a }, -1, t);
      case "hazard": return this.line("hazard", { a }, e.a, t);
      case "avoid": return this.line("avoid", { a }, e.a, t);
      case "riderless": return this.line("riderless", { a }, e.a, t);
      case "finish":
        if (e.v === 1) {
          this.pendingWinner = e.a;
          // il vincitore ufficiale arriva coi risultati (i quirk d'arrivo possono ribaltare il fotofinish)
          setTimeout(() => this.announce(t), 900);
        }
        return;
      case "dq": return this.line("dq", { a }, -1, t);
    }
    void order;
  }

  announce(t) {
    if (this.finished) return;
    this.finished = true;
    const fin = this.rep.finish.slice().filter((f) => f.pos > 0).sort((x, y) => x.pos - y.pos);
    const photo = this.rep.events.find((e) => e.k === "photo");
    const byNum = (n) => this.rep.horses.findIndex((h) => h.num === n);
    const w = fin[0] ? byNum(fin[0].num) : this.pendingWinner;
    const s = fin[1] ? byNum(fin[1].num) : -1;
    const th = fin[2] ? byNum(fin[2].num) : -1;
    if (photo) this.line("photo", { a: this.name(photo.a), b: this.name(photo.b) }, -1, t);
    setTimeout(() => {
      this.line("winner", { a: this.name(w) }, -1, t);
      if (s >= 0) setTimeout(() => this.hooks.say(fill(pick(this.T.second), { b: this.name(s), c: th >= 0 ? this.name(th) : "-" }), "happy", 1, true), 3200);
      const lastF = fin[fin.length - 1];
      if (lastF && fin.length > 4) setTimeout(() => this.hooks.say(fill(pick(this.T.last), { a: this.name(byNum(lastF.num)) }), "sly", 1, true), 7500);
    }, photo ? 2600 : 0);
  }
}
