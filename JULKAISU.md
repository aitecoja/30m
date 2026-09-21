# Julkaisu GitHubiin

Ohje vie sovelluksen puhelimeen alusta loppuun. Kaksi reittiä: **selaimella**
(ei vaadi mitään asennettavaa) tai **komentorivillä**. Valitse toinen, älä molempia.

Lopputuloksena on osoite muotoa `https://kayttajanimi.github.io/sprint30/`, jonka
asennat puhelimen kotivalikkoon. Sen jälkeen sovellus toimii ilman verkkoa.

---

## Ennen kuin aloitat: kaksi asiaa jotka on hyvä tietää

**Repositorion on oltava julkinen.** GitHubin ilmaisella tilillä Pages toimii vain
julkisista repositorioista. Tämä ei ole tietoturvaongelma tässä tapauksessa: julkiseksi
tulee vain sovelluksen koodi, ei yksikään mittaustulos. Kaikki urheilijat ja ajat
tallentuvat pelkästään puhelimen omaan muistiin eivätkä poistu laitteesta koskaan.

**Osoite riippuu repositorion nimestä.** Jos nimeät repositorion `sprint30`, osoitteeksi
tulee `https://kayttajanimi.github.io/sprint30/`. Sovellus käyttää suhteellisia polkuja,
joten mikä tahansa nimi kelpaa.

---

## Vaihe 1 — GitHub-tili

Jos tiliä ei ole, luo se osoitteessa <https://github.com/signup>. Tarvitset
sähköpostiosoitteen ja käyttäjänimen. Käyttäjänimi näkyy sovelluksen osoitteessa,
joten valitse sellainen jonka kirjoitat mielelläsi puhelimella.

Vahvista sähköposti ennen jatkamista. Vahvistamattomalla tilillä Pages ei julkaise.

---

## Vaihe 2 — Luo repositorio

1. Paina oikeasta yläkulmasta **+** → **New repository**.
2. *Repository name*: `sprint30`
3. *Description* (vapaaehtoinen): `30 metrin juoksun ajanotto`
4. Valitse **Public**.
5. **Älä** rastita kohtaa *Add a README file*. Tiedostoissa on jo oma README.
6. **Create repository**.

Näet nyt tyhjän repositorion ja joukon ohjeita. Jatka jommallakummalla reitillä.

---

## Vaihe 3A — Vienti selaimella (suositus)

Toimii tavallisella tietokoneella. Puhelimella tiedostojen valinta on hankalaa,
joten käytä tietokonetta tähän vaiheeseen.

1. Pura sovelluksen tiedostot yhteen kansioon. Kansiossa pitää olla nämä
   yksitoista tiedostoa **suoraan**, ei alikansiossa:

   ```
   index.html
   styles.css
   app.js
   detector.js
   storage.js
   settings.js
   sw.js
   manifest.webmanifest
   icon-192.png
   icon-512.png
   icon-maskable-512.png
   ```

   (README.md ja tämä JULKAISU.md voivat tulla mukaan, mutta eivät ole pakollisia.)

2. Repositorion sivulla: **uploading an existing file** -linkki, tai
   **Add file** → **Upload files**.

3. Raahaa **tiedostot**, älä kansiota. Tämä on ohjeen yleisin virhe: jos raahaat
   kansion, tiedostot menevät alikansioon eikä sivusto löydä niitä. Varmista
   latausnäkymässä, että listassa lukee `index.html` eikä `sprint30/index.html`.

4. Alareunan *Commit changes* -kenttään esimerkiksi `Ensimmäinen versio` ja
   **Commit changes**.

Siirry vaiheeseen 4.

---

## Vaihe 3B — Vienti komentorivillä

Vaatii gitin. Mene kansioon jossa tiedostot ovat:

```bash
cd sprint30
git init
git add .
git commit -m "30 m ajanotto"
git branch -M main
git remote add origin https://github.com/KAYTTAJANIMI/sprint30.git
git push -u origin main
```

Korvaa `KAYTTAJANIMI` omallasi. GitHub kysyy kirjautumista: salasana ei enää kelpaa,
vaan tarvitset *personal access tokenin* (Settings → Developer settings → Personal
access tokens → Tokens (classic) → Generate new token, oikeudeksi `repo`). Liitä token
salasanakenttään.

Jos tämä tuntuu hankalalta, vaihe 3A on nopeampi.

---

## Vaihe 4 — Kytke GitHub Pages päälle

1. Repositoriossa **Settings** (yläpalkin hammasratas, ei tilin asetukset).
2. Vasemmasta valikosta **Pages**.
3. *Build and deployment* → *Source*: **Deploy from a branch**.
4. *Branch*: **main**, kansio **/ (root)**. **Save**.

Sivun yläreunaan ilmestyy muutaman minuutin kuluttua vihreä laatikko ja osoite:

```
https://KAYTTAJANIMI.github.io/sprint30/
```

Julkaisun etenemisen näet välilehdeltä **Actions**. Vihreä täppä tarkoittaa valmista.
Ensimmäinen julkaisu kestää tyypillisesti 1–3 minuuttia, joskus kymmenen.

---

## Vaihe 5 — Asenna puhelimeen

1. Avaa osoite puhelimen **Chromella**. (Muut selaimet eivät asenna sovellusta
   luotettavasti Androidilla.)
2. Tarkista, että osoiterivillä on **lukkokuvake** eli yhteys on https. Ilman sitä
   kamera ei toimi.
3. Chromen valikko (kolme pistettä) → **Lisää aloitusnäyttöön** tai **Asenna sovellus**.
4. Avaa sovellus kotivalikon kuvakkeesta. Se aukeaa omana ikkunanaan ilman osoiteriviä.
5. Paina **Käynnistä kamera** ja **Salli** kun lupa kysytään.

Tämän jälkeen sovellus toimii lentotilassa. Verkkoa tarvitaan vain päivittämiseen.

---

## Vaihe 6 — Varmista että se toimii ennen kentälle lähtöä

Tee tämä sisällä, ei ensimmäistä kertaa harjoituksissa.

1. Aseta puhelin pöydälle niin että se näkee kaksi eri kohtaa huoneesta.
2. Rajaa lähtöalue ja maalialue.
3. Katso yläpalkin fps-lukemaa. Kirkkaassa valossa sen pitäisi asettua
   30:een tai 60:een.
4. Paina **Mittaa**. Odota että lukee "Odottaa lähtöä".
5. Heiluta kättä lähtöalueella — kellon pitää käynnistyä.
6. Odota suoja-ajan yli ja heiluta kättä maalialueella — kellon pitää pysähtyä.
7. Tallenna tulos ja tarkista, että se näkyy Valikko → Historia.
8. Kokeile Valikko → Vie CSV-tiedostoon.

Jos jokin näistä ei toimi, katso *Vianetsintä* alta.

---

## Päivittäminen

Sovellus tallentaa itsensä puhelimen välimuistiin, jotta se toimisi offline. Siksi
pelkkä tiedoston muuttaminen GitHubissa **ei riitä** — puhelin näyttäisi edelleen
vanhaa versiota.

Jokaisen muutoksen yhteydessä:

1. Avaa `sw.js` GitHubissa ja paina kynäkuvaketta (*Edit this file*).
2. Etsi rivi

   ```js
   const CACHE_NAME = 'sprint30-v1';
   ```

3. Nosta numeroa: `sprint30-v2`, seuraavalla kerralla `sprint30-v3` ja niin edelleen.
4. **Commit changes**.
5. Avaa sovellus puhelimessa **verkkoyhteyden kanssa**, sulje se kokonaan ja avaa
   uudelleen. Uusi versio on nyt käytössä.

Jos vanha versio jää silti sitkeästi päälle: Chromen asetukset → Sivustoasetukset →
Kaikki sivustot → `kayttajanimi.github.io` → **Poista tiedot**. Sitten avaa osoite
uudelleen ja asenna kotivalikkoon. Huomaa että tämä poistaa myös tallennetut tulokset,
joten vie CSV ensin.

---

## Varmuuskopiointi

Tulokset ovat vain puhelimessa. Ne katoavat jos puhelin hajoaa, sovellus poistetaan tai
selaimen tiedot tyhjennetään. Vie **CSV säännöllisesti**, esimerkiksi jokaisen
harjoituskerran jälkeen: Valikko → Vie CSV-tiedostoon. Tiedosto menee puhelimen
Lataukset-kansioon, josta voit lähettää sen itsellesi sähköpostilla tai tallentaa
pilvipalveluun.

---

## Vianetsintä

**Osoite antaa 404-virheen.**
Tiedostot ovat todennäköisesti alikansiossa. Avaa repositorion etusivu: jos näet
kansion nimeltä `sprint30` etkä tiedostoja `index.html`, `app.js` ja niin edelleen,
raahasit kansion tiedostojen sijaan. Poista tiedostot ja lataa uudelleen.
Tarkista myös, että Pages on kytketty haaraan `main` ja kansioon `/ (root)`.

**Sivu aukeaa mutta on tyhjä tai tyylitön.**
Jokin tiedosto puuttuu. Vertaa repositorion tiedostolistaa vaiheen 3A listaan.

**Kameran käynnistys antaa virheilmoituksen luvasta.**
Osoiterivin lukkokuvake → Oikeudet → Kamera → Salli. Lataa sivu uudelleen.
Jos avasit sovelluksen tiedostona puhelimen muistista etkä https-osoitteesta,
kamera ei toimi lainkaan — tämä on selaimen turvasääntö, jota ei voi ohittaa.

**"Asenna sovellus" ei näy Chromen valikossa.**
Odota että sivu on latautunut kokonaan ja yritä uudelleen. Tarkista myös, että osoite
on https eikä http.

**Yläpalkki näyttää 30 fps vaikka valo on kirkas.**
Puhelin ei tarjoa 60 fps:ää tällä resoluutiolla. Mittaus toimii silti, epävarmuus on
vain 33 ms yhden ruudun sijaan 17 ms. Jos haluat kokeilla, muuta `app.js`-tiedostossa
`width: { ideal: 1280 }` ja `height: { ideal: 720 }` arvoiksi `960` ja `540` — ja muista
nostaa `CACHE_NAME`-versiota.

**Mittaus laukeaa itsestään heti virityksen jälkeen.**
Nosta asetuksista *Liikkeen vähimmäisosuus* -arvoa esimerkiksi arvoon 0,10. Tarkista
myös, ettei teline värise ja ettei rajatuilla alueilla ole liikkuvia varjoja tai muita
ihmisiä.

**Tulokset katosivat.**
Selain on todennäköisesti tyhjentänyt tallennustilan. Sovellus pyytää käynnistyessään
pysyvää tallennustilaa, mutta Android voi silti siivota kauan käyttämättä olleen
sovelluksen tiedot. Tämän takia CSV-vienti kannattaa tehdä säännöllisesti.

---

## Jos et halua käyttää GitHubia

Mikä tahansa https-osoite kelpaa. Vaihtoehtoja: Netlify Drop
(<https://app.netlify.com/drop>, raahaa kansio, saat osoitteen heti ilman tiliä),
Cloudflare Pages tai oma verkkopalvelin. Ainoa vaatimus on, että kaikki tiedostot ovat
samassa hakemistossa ja yhteys on https.
