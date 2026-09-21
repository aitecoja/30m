# 30 m ajanotto

Kamerapohjainen ajanotto 30 metrin juoksuun. Yksi puhelin telineessä, ei erillisiä
kennoja, ei verkkoyhteyttä. Lähtö ja maali tunnistetaan liikkeestä kuvaan rajatuilta
alueilta, ja aika luetaan kuvavirran omista ruutuaikaleimoista.

## Miksi aika on luotettava

Sekä lähtö että maali luetaan **samasta kuvavirrasta**. Kameran putkiviive — se
tuntematon aika, joka kuluu kennon valotuksesta siihen kun selain saa ruudun — on
molemmissa sama ja kumoutuu vähennyslaskussa. Jäljelle jää vain ruutuväli.

Aikaa ei lasketa nimellisestä kuvataajuudesta, vaan jokaisen ruudun omasta
aikaleimasta (`requestVideoFrameCallback`, `metadata.mediaTime`). Jos kamera pudottaa
hämärässä 60 ruudusta 30:een, aika ei väärenny — vain epävarmuus kasvaa, ja sovellus
näyttää toteutuneen kuvataajuuden yläpalkissa.

Laukaisu vaatii kaksi peräkkäistä ruutua kynnyksen yli, mutta aika luetaan parin
**ensimmäisestä** ruudusta. Vahvistus ei siis siirrä tulosta.

Realistinen tarkkuus hyvällä asettelulla: **±0,03–0,06 s**. Sovellus näyttää tuloksen
rinnalla yhden ruutuvälin epävarmuuden eikä lupaa parempaa.

## Asennus puhelimeen

Kamera ei toimi `file://`-osoitteesta, koska selain ei pidä sitä turvallisena
kontekstina. Sovellus on siis julkaistava https-osoitteeseen kerran, minkä jälkeen se
toimii pysyvästi ilman verkkoa.

### 1. Vie tiedostot GitHubiin

Luo uusi julkinen repositorio, esimerkiksi `sprint30`, ja vie tämän kansion sisältö
sen juureen:

```bash
cd sprint30
git init
git add .
git commit -m "30 m ajanotto"
git branch -M main
git remote add origin https://github.com/KÄYTTÄJÄ/sprint30.git
git push -u origin main
```

Voit myös raahata tiedostot GitHubin verkkosivulla "Add file → Upload files" -toiminnolla,
jos et halua käyttää komentoriviä.

### 2. Kytke GitHub Pages päälle

Repositoriossa **Settings → Pages**. Kohtaan *Source* valitse `Deploy from a branch`,
haaraksi `main` ja kansioksi `/ (root)`. Tallenna. Muutaman minuutin päästä osoite on

```
https://KÄYTTÄJÄ.github.io/sprint30/
```

### 3. Asenna kotivalikkoon

Avaa osoite puhelimen Chromella. Valikosta **Lisää aloitusnäyttöön** (tai *Asenna
sovellus*). Tämän jälkeen sovellus avautuu omana ikkunanaan ilman osoiteriviä ja
toimii lentotilassa.

Ensimmäisellä käynnistyksellä sovellus kysyy kameran käyttöoikeuden. Salli se
pysyvästi.

### Päivittäminen

Kun muutat tiedostoja, **nosta `sw.js`-tiedoston `CACHE_NAME`-versionumeroa**
(`sprint30-v1` → `sprint30-v2`). Muuten puhelin näyttää vanhan version välimuistista.

## Puhelimen asettelu kentällä

Tämä on ratkaisun tärkein yksittäinen asia. Puhelimen pitää nähdä kaksi pistettä,
jotka ovat 30 metrin päässä toisistaan, eikä pääkameran noin 65 asteen kuvakulma
salli mitä tahansa asettelua.

**Toimiva asettelu:** puhelin noin **5 m maalin taakse ja 5 m sivuun** radasta, niin
että maaliviiva näkyy noin 45 asteen kulmassa.

```
  lähtö                                              maali
    |                                                  |
    X------------------- 30 m -----------------------→ X
                                                       |
                                                    5 m|
                                                       |
                                              5 m      ●  puhelin
                                            ←--------→
```

Maaliviiva nähdään vinosti, joten juoksija liikkuu kuvassa sivusuunnassa ja ylityshetki
on terävä. Lähtö on noin 31 m päässä ja näkyy pienenä, mutta lähdöstä tarvitaan vain
liikkeen alkaminen, ei viivan ylitystä.

**Älä aseta puhelinta radan suuntaisesti maalin taakse.** Silloin juoksija tulee
suoraan kohti, 30 cm etenemistä on kuvassa vain muutama pikseli, eikä maalihetkeä voi
erottaa tarkasti. Asettelu näyttää helpoimmalta ja on huonoin.

Teline ei saa liikkua lainkaan mittauksen aikana. Pienikin töytäisy näkyy liikkeenä
molemmilla alueilla.

## Käyttö

1. **Käynnistä kamera.** Suuntaa ja lukitse teline.
2. **Lähtöalue.** Vedä sormella tiukka suorakulmia juoksijan lähtöasennon ympärille.
   Mitä tiukempi rajaus, sitä varmempi tunnistus.
3. **Maalialue.** Vedä kapea pystykaistale maaliviivan kohdalle. Pidä se kapeana —
   leveä alue laukeaa liian aikaisin.
4. **Mittaa.** Sovellus opettelee taustan noin 1,5 sekunnin ajan, sitten näyttö
   kertoo "Odottaa lähtöä".
5. Juoksija lähtee omaan tahtiinsa. Liike lähtöalueella käynnistää kellon.
6. Maali pysäyttää kellon. **Tallenna** tai **Hylkää**.

Mittarit näytön alareunassa kertovat, kuinka lähellä laukaisukynnystä kumpikin alue on.
Jos mittari lepää jatkuvasti keltaisena ilman liikettä, nosta asetuksista
*Liikkeen vähimmäisosuus* -arvoa.

### Jälkitarkastus

Jos automaattinen tunnistus epäonnistuu, paina **Tarkista video**. Selaa ruutu
kerrallaan, merkitse oikea lähtöruutu ja maaliruutu, ja paina *Käytä korjattua aikaa*.
Korjattu tulos merkitään tallennukseen omalla mittaustavallaan.

Video säilyy vain nykyisen tuloksen ajan, ei historiassa. Näin puhelimen muisti ei
täyty harjoituskerran aikana.

## Asetukset ja niiden säätäminen

| Asetus | Oletus | Milloin muutetaan |
|---|---|---|
| Maalin suoja-aika | 3,0 s | Nosta, jos avustaja liikkuu maalialueella lähdön jälkeen |
| Juoksun enimmäiskesto | 20 s | Harvoin |
| Pikselin muutosherkkyys | 18 | Laske hämärässä, nosta rakeisessa kuvassa |
| Liikkeen vähimmäisosuus | 0,06 | **Nosta, jos mittaus laukeaa itsestään.** Laske, jos juoksija ei laukaise |
| Taustan mukautumisnopeus | 0,02 | Nosta vaihtelevassa ulkovalossa |

## Tunnetut rajoitukset

- Muu liike rajatulla alueella laukaisee mittauksen. Pidä alueet tiukkoina ja tyhjinä.
- Kuvataajuus putoaa hämärässä automaattisesti, koska kamera pidentää valotusaikaa.
  Salivalaistuksessa 60 fps ei ole taattu; sovellus näyttää toteutuneen arvon.
- Ruutu kerrallaan selaaminen nojaa selaimen videohakuun. Se on tarkka Chromessa,
  mutta ei matemaattisen tarkka: käytä merkittyä ruutuaikaa, älä liukusäätimen asemaa.
- Tulos on lentävän lähdön kaltainen: kello käynnistyy juoksijan omasta liikkeestä,
  ei ulkoisesta merkistä, joten reaktioaika ei sisälly aikaan. Ajat eivät ole
  vertailukelpoisia lähtömerkillä mitattuihin.

## Tiedostot

```
index.html                 käyttöliittymän rakenne
styles.css                 tyylit
app.js                     tilakone, kamera, tulokset
detector.js                liiketunnistus ja laukaisulogiikka
storage.js                 IndexedDB: urheilijat ja juoksut
settings.js                asetukset localStoragessa
sw.js                      service worker, offline-välimuisti
manifest.webmanifest       PWA-manifesti
icon-192.png               sovelluskuvakkeet
icon-512.png
icon-maskable-512.png
```
