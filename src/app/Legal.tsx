"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import type { Lang } from "./i18n";

// Textos legales de /privacy y /terms, en el idioma elegido en la app (menudo:lang).
// Describen lo que hace el código: todo se guarda en el navegador; al servidor solo llegan las búsquedas de imágenes
export const CONTACT = "mailto:dominicigiuliano@bookdeundes.com?subject=Menudo";
const UPDATED = { it: "Ultimo aggiornamento: 1 novembre 2026", es: "Última actualización: 1 de noviembre de 2026" };

type Doc = { title: string; sections: [string, string[]][] };

const DOCS: Record<"privacy" | "terms", Record<Lang, Doc>> = {
  privacy: {
    es: {
      title: "Política de privacidad",
      sections: [
        ["Responsable", ["Menudo es un servicio de Bookdeundes, responsable del tratamiento de los datos descritos en esta política. Puedes escribirnos desde el enlace «Contactar» al pie del archivo."]],
        [
          "Tus cartas y tu cuenta se quedan en tu dispositivo",
          [
            "Menudo funciona en tu navegador. Las cartas, las imágenes que subes, los ajustes (idioma, tema) y la cuenta (tu email y una huella cifrada de la contraseña, nunca la contraseña en sí) se guardan solo en este dispositivo, en el almacenamiento local del navegador.",
            "Esos datos no se envían a nuestros servidores y no tenemos acceso a ellos. Si usas Menudo en otro dispositivo o navegador, empezarás de cero.",
          ],
        ],
        [
          "Búsqueda de imágenes",
          [
            "Cuando buscas imágenes, el texto que escribes se envía a través de nuestro servidor a Pixabay (Pixabay GmbH, Alemania) para obtener resultados, y la imagen que eliges se descarga también a través de nuestro servidor. No guardamos tus búsquedas.",
          ],
        ],
        [
          "Alojamiento",
          [
            "Menudo está alojado en Vercel Inc. (Estados Unidos). Como cualquier servidor web, Vercel registra datos técnicos de cada visita (dirección IP, navegador, fecha y página) para que el servicio funcione y sea seguro. Vercel trata estos datos como encargado, con las garantías del RGPD para las transferencias internacionales.",
          ],
        ],
        ["Cookies", ["Menudo no usa cookies ni herramientas de analítica o publicidad. Solo usa el almacenamiento local del navegador, imprescindible para guardar tus cartas y ajustes."]],
        [
          "Cuánto tiempo se guardan",
          [
            "Las cartas del archivo se borran solas 30 días después de su último cambio. Puedes borrar cada carta desde el archivo; el resto se queda en tu dispositivo hasta que borras los datos de este sitio en los ajustes del navegador.",
          ],
        ],
        [
          "Tus derechos",
          [
            "Tienes derecho a acceder a tus datos, rectificarlos, suprimirlos, oponerte a su tratamiento y pedir su portabilidad. Como guardamos tus cartas y tu cuenta solo en tu dispositivo, puedes hacerlo directamente desde la app o el navegador. Para cualquier duda, escríbenos.",
            "También puedes reclamar ante la autoridad de protección de datos: en España, la Agencia Española de Protección de Datos (aepd.es); en Italia, el Garante per la protezione dei dati personali (garanteprivacy.it).",
          ],
        ],
        ["Cambios", ["Si cambiamos esta política, publicaremos aquí la nueva versión con su fecha."]],
      ],
    },
    it: {
      title: "Informativa sulla privacy",
      sections: [
        ["Titolare", ["Menudo è un servizio di Bookdeundes, titolare del trattamento dei dati descritti in questa informativa. Puoi scriverci dal link «Contatti» in fondo all'archivio."]],
        [
          "I tuoi menù e il tuo account restano sul tuo dispositivo",
          [
            "Menudo funziona nel tuo browser. I menù, le immagini che carichi, le impostazioni (lingua, tema) e l'account (la tua email e un'impronta cifrata della password, mai la password stessa) sono salvati solo su questo dispositivo, nella memoria locale del browser.",
            "Questi dati non vengono inviati ai nostri server e non possiamo accedervi. Se usi Menudo su un altro dispositivo o browser, ricominci da zero.",
          ],
        ],
        [
          "Ricerca di immagini",
          [
            "Quando cerchi immagini, il testo che scrivi viene inviato tramite il nostro server a Pixabay (Pixabay GmbH, Germania) per ottenere i risultati, e l'immagine che scegli viene scaricata anch'essa tramite il nostro server. Non conserviamo le tue ricerche.",
          ],
        ],
        [
          "Hosting",
          [
            "Menudo è ospitato da Vercel Inc. (Stati Uniti). Come qualsiasi server web, Vercel registra dati tecnici di ogni visita (indirizzo IP, browser, data e pagina) per il funzionamento e la sicurezza del servizio. Vercel tratta questi dati come responsabile del trattamento, con le garanzie del GDPR per i trasferimenti internazionali.",
          ],
        ],
        ["Cookie", ["Menudo non usa cookie né strumenti di analisi o pubblicità. Usa solo la memoria locale del browser, indispensabile per salvare i tuoi menù e le impostazioni."]],
        [
          "Per quanto tempo",
          [
            "I menù dell'archivio si cancellano da soli 30 giorni dopo l'ultima modifica. Puoi cancellare ogni menù dall'archivio; il resto rimane sul tuo dispositivo finché non cancelli i dati di questo sito nelle impostazioni del browser.",
          ],
        ],
        [
          "I tuoi diritti",
          [
            "Hai diritto di accedere ai tuoi dati, rettificarli, cancellarli, opporti al trattamento e chiederne la portabilità. Poiché menù e account restano solo sul tuo dispositivo, puoi farlo direttamente dall'app o dal browser. Per qualsiasi dubbio, scrivici.",
            "Puoi anche presentare reclamo all'autorità di protezione dei dati: in Italia, il Garante per la protezione dei dati personali (garanteprivacy.it); in Spagna, la Agencia Española de Protección de Datos (aepd.es).",
          ],
        ],
        ["Modifiche", ["Se modifichiamo questa informativa, pubblicheremo qui la nuova versione con la sua data."]],
      ],
    },
  },
  terms: {
    es: {
      title: "Términos y condiciones",
      sections: [
        ["Qué es Menudo", ["Menudo es una herramienta gratuita de Bookdeundes para diseñar e imprimir cartas de restaurante. Al usarla aceptas estos términos."]],
        [
          "Tu contenido",
          [
            "Los textos, precios, logos e imágenes que pones en tus cartas son tuyos y eres responsable de ellos: de que sean correctos (precios, alérgenos, información obligatoria) y de tener derecho a usar los logos e imágenes que subes.",
            "Las imágenes de la búsqueda vienen de Pixabay y se rigen por su licencia (pixabay.com/service/license-summary).",
          ],
        ],
        [
          "Tus datos se guardan en tu dispositivo",
          [
            "Las cartas se guardan en tu navegador y las del archivo se borran 30 días después de su último cambio. Si borras los datos del navegador o cambias de dispositivo, se pierden. Te recomendamos imprimir o guardar en PDF las cartas que quieras conservar.",
          ],
        ],
        [
          "El servicio",
          [
            "Ofrecemos Menudo tal cual, sin garantía de que esté siempre disponible o libre de errores. Podemos cambiarlo, mejorarlo o dejar de ofrecerlo en cualquier momento.",
            "Revisa siempre la carta antes de imprimirla. En la medida en que la ley lo permite, no respondemos de errores en el contenido impreso ni de la pérdida de cartas guardadas en tu dispositivo.",
          ],
        ],
        ["Propiedad", ["La app, su nombre, su diseño y su código pertenecen a Bookdeundes. Tus cartas son tuyas."]],
        ["Cambios", ["Si cambiamos estos términos, publicaremos aquí la nueva versión con su fecha. Para cualquier duda, escríbenos."]],
      ],
    },
    it: {
      title: "Termini e condizioni",
      sections: [
        ["Che cos'è Menudo", ["Menudo è uno strumento gratuito di Bookdeundes per creare e stampare menù di ristorante. Usandolo accetti questi termini."]],
        [
          "I tuoi contenuti",
          [
            "I testi, i prezzi, i loghi e le immagini che inserisci nei tuoi menù sono tuoi e ne sei responsabile: della loro correttezza (prezzi, allergeni, informazioni obbligatorie) e di avere il diritto di usare i loghi e le immagini che carichi.",
            "Le immagini della ricerca provengono da Pixabay e sono soggette alla sua licenza (pixabay.com/service/license-summary).",
          ],
        ],
        [
          "I tuoi dati restano sul tuo dispositivo",
          [
            "I menù sono salvati nel tuo browser e quelli dell'archivio si cancellano 30 giorni dopo l'ultima modifica. Se cancelli i dati del browser o cambi dispositivo, vanno persi. Ti consigliamo di stampare o salvare in PDF i menù che vuoi conservare.",
          ],
        ],
        [
          "Il servizio",
          [
            "Offriamo Menudo così com'è, senza garanzia che sia sempre disponibile o privo di errori. Possiamo modificarlo, migliorarlo o smettere di offrirlo in qualsiasi momento.",
            "Controlla sempre il menù prima di stamparlo. Nei limiti consentiti dalla legge, non rispondiamo di errori nel contenuto stampato né della perdita di menù salvati sul tuo dispositivo.",
          ],
        ],
        ["Proprietà", ["L'app, il suo nome, il suo design e il suo codice appartengono a Bookdeundes. I tuoi menù sono tuoi."]],
        ["Modifiche", ["Se modifichiamo questi termini, pubblicheremo qui la nuova versione con la sua data. Per qualsiasi dubbio, scrivici."]],
      ],
    },
  },
};

const BACK = { it: "Torna a Menudo", es: "Volver a Menudo" };

// Idioma y tema guardados por la app; en el servidor, italiano y claro
const readLang = (): Lang => {
  try {
    const l = localStorage.getItem("menudo:lang");
    if (l === "it" || l === "es") return l;
  } catch {}
  return navigator.language.startsWith("es") ? "es" : "it";
};
const noSubscribe = () => () => {};

export default function Legal({ doc }: { doc: "privacy" | "terms" }) {
  const lang = useSyncExternalStore(noSubscribe, readLang, () => "it" as const);
  const d = DOCS[doc][lang];
  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      document.documentElement.dataset.theme = localStorage.getItem("menudo:theme") === "dark" ? "dark" : "light";
    } catch {}
  }, [lang]);
  return (
    <div className="canvas min-h-dvh px-4 py-8 md:py-12">
      <article className="mx-auto max-w-2xl rounded-xl bg-surface p-6 shadow-sm ring-1 ring-laguna/60 md:p-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-mare hover:underline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" className="size-6 rounded-md" />
          {BACK[lang]}
        </Link>
        <h1 className="mt-6 text-[28px] leading-tight font-semibold tracking-tight">{d.title}</h1>
        <p className="mt-1 text-sm text-ink/60">{UPDATED[lang]}</p>
        {d.sections.map(([h, ps]) => (
          <section key={h} className="mt-8">
            <h2 className="text-[17px] font-semibold">{h}</h2>
            {ps.map((p) => (
              <p key={p} className="mt-2 leading-relaxed text-ink/80">
                {p}
              </p>
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}
