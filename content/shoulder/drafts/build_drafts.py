"""Builds the provisional shoulder lesson drafts in this folder.

Usage (from the repo root): python3 content/shoulder/drafts/build_drafts.py content/shoulder/drafts

Lessons 4 and 8 take their referral lists from docs/curriculum/SAFETY.md, so run this again
whenever SAFETY.md changes. Every lesson is rendered and checked before any file is written.
Writing is all or nothing: if a write fails part-way, files already replaced are restored and
temporary files are removed. Drafts are not
publishable: science blocks bind claim-slot ids that the publish gate rejects.
"""
import json
import os
import pathlib
import re
import sys
import tempfile

OUT = pathlib.Path(sys.argv[1])
ROOT = OUT.resolve().parents[2]

# ---------------------------------------------------------------- block helpers

def P(text): return {"kind": "paragraph", "content": text, "support": "practice-based", "claimIds": []}
def S(text, *slots): return {"kind": "paragraph", "content": text, "support": "science", "claimIds": list(slots)}
def H(text): return {"kind": "heading", "content": text}
def C(label, text): return {"kind": "callout", "content": {"label": label, "text": text}, "support": "practice-based", "claimIds": []}
def L(items): return {"kind": "checklist", "content": items, "support": "practice-based", "claimIds": []}
def D(did, alt, caption, legend, *slots):
    """A reviewed diagram block (Sol R16): every word is lesson data. Legend items are (anchor key, label, text).
    Science when it binds claim slots, practice-based otherwise."""
    return {"kind": "diagram", "content": {"diagramId": did, "alt": alt, "caption": caption, "legend": [{"key": k, "label": l, "text": t} for k, l, t in legend]},
            "support": "science" if slots else "practice-based", "claimIds": list(slots)}
def Q(prompt, options, answer, expl, *slots): return {"kind": "quiz", "content": {"prompt": prompt, "options": options, "answerIndex": answer, "explanation": expl}, "support": "science", "claimIds": list(slots)}

REFER = "Stop and refer"
POLICY = "Spindle policy"
BOUNDARY = ("Your training is not treatment for a diagnosed condition. A client with diagnosed shoulder pain, or one recovering from surgery, a dislocation or "
            "a fracture, trains within the treating clinician's plan, and you do not progress that plan on your own. This is Spindle's rule for trainers, not a research finding.")
ORIGINALITY = ("Original Spindle text, CC BY-SA 4.0. AI-drafted (Claude Opus 5.5, 2026-10-11) in our own words; the candidate sources were used only to choose and bound "
               "the facts that need a claim, and no sentence, figure, table, exercise sequence or analogy was copied from them or from any coach. The style follows "
               "docs/curriculum/STYLE.md. To be model-reviewed (D-08) with an originality check and a private provenance record before publishing.")

# ---------------------------------------------------------------- sources
# Every source records its rights: a licence with its URI, or an explicit "rights reserved"
# or "unresolved" status. We cite and paraphrase facts; no source text is reproduced.

OPEN_ACCESS_NOTE = "Cited and paraphrased only."
RESERVED = "No open licence found (Europe PMC lists none); treat as all rights reserved. Abstract read on PubMed. " + OPEN_ACCESS_NOTE

def src(kind, citation, rights, **ids):
    return {"kind": kind, "citation": citation, **ids, "rights": rights}

CC_BY_FULL = "Full text read through the Europe PMC API. " + OPEN_ACCESS_NOTE
FRANK = src("review", "Frank RM, Ramirez J, Chalmers PN, McCormick FM, Romeo AA. Scapulothoracic anatomy and snapping scapula syndrome. Anat Res Int. 2013;2013:635628.",
            "CC BY (version not stated in the article or the publisher PDF; Europe PMC lists CC BY). " + CC_BY_FULL, doi="10.1155/2013/635628", pmid="24369502", pmcid="PMC3863500")
CAVANAUGH = src("review", "Cavanaugh E, Arcot Santillan A, Hoshikawa K, Giambini H. Subregions of the rotator cuff muscles present distinct anatomy, biomechanics, and function. Sports (Basel). 2024;12(12):349.",
                "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). " + CC_BY_FULL, doi="10.3390/sports12120349", pmid="39728889", pmcid="PMC11679125")
VIJIAN = src("paper", "Vijian K, Cheng YT, Idris Z, et al. Manual muscle testing of the scapula and the upper limb through bedside examination. Malays J Med Sci. 2023;30(1):198-212. (Brief Communication.)",
             "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). " + CC_BY_FULL, doi="10.21315/mjms2023.30.1.17", pmid="36875200", pmcid="PMC9984099")
JACINTO = src("review", "Jacinto J, Camões-Barbosa A, Carda S, Hoad D, Wissel J. A practical guide to botulinum neurotoxin treatment of shoulder spasticity 1: anatomy, physiology, and goal setting. Front Neurol. 2022;13:1004629.",
              "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), confirmed through the article's licence link. " + CC_BY_FULL, doi="10.3389/fneur.2022.1004629", pmid="36324373", pmcid="PMC9618862")
# OpenStax is not a claim source: its terms forbid ingestion into AI models. It appears only as an
# optional further-reading link, with its licence shown.
OPENSTAX_READING = {"label": "Further reading (not a claim source): OpenStax Anatomy and Physiology 2e, section 9.6, the shoulder joint. CC BY-NC-SA 4.0.",
                    "href": "https://openstax.org/books/anatomy-and-physiology-2e/pages/9-6-anatomy-of-selected-synovial-joints", "type": "reference"}
HOWELL = src("paper", "Howell SM, Galinat BJ. The glenoid-labral socket. A constrained articular surface. Clin Orthop Relat Res. 1989;(243):122-125.", RESERVED, pmid="2721051")
LIPPITT = src("paper", "Lippitt S, Matsen F. Mechanisms of glenohumeral joint stability. Clin Orthop Relat Res. 1993;(291):20-28.", RESERVED, pmid="8504601")
FERNANDEZ = src("meta_analysis", "Fernández-Matías R, Ballesteros-Frutos J, Gallardo-Zamora P, Requejo-Salinas N, Caballero-Pozo I, Ludewig P, Lluch-Girbés E. Scapular kinematics variability in individuals with and without rotator cuff-related shoulder pain: a systematic review with multilevel meta-regression. Braz J Phys Ther. 2025;29(6):101261.",
                "Copyright Associação Brasileira de Pesquisa e Pós-Graduação em Fisioterapia, published by Elsevier; the PubMed record says all rights reserved and Europe PMC lists no licence. Free to read in PMC. Abstract read on PubMed. " + OPEN_ACCESS_NOTE,
                doi="10.1016/j.bjpt.2025.101261", pmid="40845626", pmcid="PMC12398250")
KIBLER = src("consensus", "Kibler WB, Ludewig PM, McClure PW, et al. Clinical implications of scapular dyskinesis in shoulder injury: the 2013 consensus statement from the 'Scapular Summit'. Br J Sports Med. 2013;47(14):877-885.", RESERVED, doi="10.1136/bjsports-2013-092425", pmid="23580420")
BARRETT = src("systematic_review", "Barrett E, O'Keeffe M, O'Sullivan K, Lewis J, McCreesh K. Is thoracic spine posture associated with shoulder pain, range of motion and function? A systematic review. Man Ther. 2016;26:38-46.",
              "Crown copyright 2016, published by Elsevier; all rights reserved. Abstract read on PubMed. " + OPEN_ACCESS_NOTE, doi="10.1016/j.math.2016.07.008", pmid="27475532")
FIALHO = src("systematic_review", "Fonseca Fialho HR, Gava V, Fonseca RNS, Kamonseki DH, Barbosa GM. Thinking outside the shoulder: a systematic review and metanalysis of kinetic chain characteristics in non-athletes with shoulder pain. PLoS One. 2024;19(12):e0314909.",
             "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). " + OPEN_ACCESS_NOTE, doi="10.1371/journal.pone.0314909", pmid="39652591", pmcid="PMC11627437")
ZHAO = src("meta_analysis", "Zhao Q, Palani P, Kassab NS, et al. Evidence-based approach to the shoulder examination for subacromial bursitis and rotator cuff tears: a systematic review and meta-analysis. BMC Musculoskelet Disord. 2024;25(1):1028.",
           "CC BY-NC-ND 4.0 (https://creativecommons.org/licenses/by-nc-nd/4.0/). Full text read. " + OPEN_ACCESS_NOTE, doi="10.1186/s12891-024-08144-z", pmid="39702033", pmcid="PMC11660602")
HEGEDUS = src("meta_analysis", "Hegedus EJ, Goode AP, Cook CE, et al. Which physical examination tests provide clinicians with the most value when examining the shoulder? Update of a systematic review with meta-analysis of individual tests. Br J Sports Med. 2012;46(14):964-978.",
              RESERVED + " Historical context only.", doi="10.1136/bjsports-2012-091066", pmid="22773322")
BESS25 = src("consensus", "Pandey RA, Singh HP, BESS Subacromial Pain Working Group. BESS Patient Care Pathway: Subacromial pain. Shoulder Elbow. 2025;17(6):713-724.",
             "(c) The Author(s) 2025. No licence stated in the PDF read, and Europe PMC lists none: unresolved; treat as all rights reserved. Full PDF read. " + OPEN_ACCESS_NOTE,
             doi="10.1177/17585732251374282", pmid="41245988", pmcid="PMC12611748", url="https://bess.ac.uk/wp-content/uploads/2026/03/Subacromial-Shoulder-Pain-2025.pdf")
LAHDEOJA = src("meta_analysis", "Lähdeoja T, Karjalainen T, Jokihaara J, Salamh P, Kavaja L, Agarwal A, et al. Subacromial decompression surgery for adults with shoulder pain: a systematic review with meta-analysis. Br J Sports Med. 2020;54(11):665-673.",
               "(c) Author(s) (or their employer(s)) 2020, no commercial re-use (BMJ); Europe PMC lists no licence. Abstract read on PubMed. " + OPEN_ACCESS_NOTE,
               doi="10.1136/bjsports-2018-100486", pmid="30647053")
NAUNTON = src("meta_analysis", "Naunton J, Street G, Littlewood C, Haines T, Malliaras P. Effectiveness of progressive and resisted and non-progressive or non-resisted exercise in rotator cuff related shoulder pain: a systematic review and meta-analysis of randomized controlled trials. Clin Rehabil. 2020;34(9):1198-1216.", RESERVED, doi="10.1177/0269215520934147", pmid="32571081")
TENA = src("meta_analysis", "Tena-Portilla A, Martín-San Agustín R, Gacto-Sánchez M, Escriche-Escuder A, et al. Effectiveness of exercise in rotator cuff-related shoulder pain: a systematic review with meta-analysis. Physiother Theory Pract. 2026.", RESERVED, doi="10.1080/09593985.2026.2717392", pmid="42609059")
ACSM26 = src("position_stand", "Currier BS, D'Souza AC, Singh MAF, et al. American College of Sports Medicine position stand: resistance training prescription for muscle function, hypertrophy, and physical performance in healthy adults. Med Sci Sports Exerc. 2026;58(4):851-872.",
             "CC BY-NC-ND 4.0 (https://creativecommons.org/licenses/by-nc-nd/4.0/), PMC12965823. " + OPEN_ACCESS_NOTE, doi="10.1249/MSS.0000000000003897", pmid="41843416", pmcid="PMC12965823")
PELLAND = src("meta_analysis", "Pelland JC, Remmert JF, Robinson ZP, Hinson SR, et al. The resistance training dose response: meta-regressions exploring the effects of weekly volume and frequency on muscle hypertrophy and strength gains. Sports Med. 2026;56(2):481-505.",
              "(c) The Author(s), under exclusive licence to Springer Nature; all rights reserved. Abstract read on PubMed. " + OPEN_ACCESS_NOTE, doi="10.1007/s40279-025-02344-w", pmid="41343037")
REFALO = src("meta_analysis", "Refalo MC, Helms ER, Trexler ET, Hamilton DL, Fyfe JJ. Influence of resistance training proximity-to-failure on skeletal muscle hypertrophy: a systematic review with meta-analysis. Sports Med. 2023;53(3):649-665.",
             "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), PMC9935748. " + OPEN_ACCESS_NOTE, doi="10.1007/s40279-022-01784-y", pmid="36334240", pmcid="PMC9935748")
ROBINSON = src("meta_analysis", "Robinson ZP, Pelland JC, Remmert JF, Refalo MC, et al. Exploring the dose-response relationship between estimated resistance training proximity to failure, strength gain, and muscle hypertrophy: a series of meta-regressions. Sports Med. 2024;54(9):2209-2231.", RESERVED, doi="10.1007/s40279-024-02069-2", pmid="38970765")
PAUL = src("systematic_review", "Paul RW, Sirch FR, Vata A, Zhu E, Alberta FG, et al. Chronic adaptations of the shoulder in baseball pitchers: a systematic review. Am J Sports Med. 2025;53(12):2984-2994.", RESERVED, doi="10.1177/03635465251317202", pmid="40029165")
POZZI = src("meta_analysis", "Pozzi F, Plummer HA, Shanley E, et al. Preseason shoulder range of motion screening and in-season risk of shoulder and elbow injuries in overhead athletes: systematic review and meta-analysis. Br J Sports Med. 2020;54(17):1019-1027.",
            "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), PMC7456673. " + OPEN_ACCESS_NOTE, doi="10.1136/bjsports-2019-100698", pmid="31937577", pmcid="PMC7456673")
SALAMH = src("systematic_review", "Salamh P, Bullock G, Chester R, Daniell H, et al. Risk factors associated with new onset of shoulder pain and injury among the athletic population: a systematic review of the literature. Int J Sports Phys Ther. 2025;20(3).",
             "CC BY-NC 4.0 (https://creativecommons.org/licenses/by-nc/4.0/) per the article page's licence metadata; not confirmed in the article text: treat as unresolved for reuse. Publisher text read. " + OPEN_ACCESS_NOTE,
             doi="10.26603/001c.129462", pmid="40041538", pmcid="PMC11872537", url="https://ijspt.scholasticahq.com/article/129462")
KELLER = src("meta_analysis", "Keller RA, De Giacomo AF, Neumann JA, et al. Glenohumeral internal rotation deficit and risk of upper extremity injury in overhead athletes: a meta-analysis and systematic review. Sports Health. 2018;10(2):125-132.",
             "Free to read in PMC (PMC5857737); no open licence stated; treat as all rights reserved. " + OPEN_ACCESS_NOTE, doi="10.1177/1941738118756577", pmid="29381423", pmcid="PMC5857737")

# ---------------------------------------------------------------- SAFETY.md, parsed strictly

def safety_table(md, heading, columns):
    """Rows of the first table directly under `heading`, bounded at the next heading.
    Refuses a missing heading, a missing or malformed table, or a row of the wrong width."""
    lines = md.split("\n")
    starts = [i for i, line in enumerate(lines) if line.startswith(heading)]
    if len(starts) != 1:
        raise SystemExit(f"SAFETY.md: expected exactly one heading starting {heading!r}, found {len(starts)}")
    section = []
    for line in lines[starts[0] + 1:]:
        if line.startswith("#"):
            break
        section.append(line)
    # The table is the first run of non-blank lines that starts with a pipe. Every line in that
    # run must be a pipe-delimited row: a row that lost its leading or trailing pipe is refused,
    # never silently dropped.
    start = next((i for i, l in enumerate(section) if l.startswith("|")), None)
    if start is None:
        raise SystemExit(f"SAFETY.md: no table under {heading!r}")
    table = []
    for line in section[start:]:
        if not line.strip():
            break
        if not (line.startswith("|") and line.rstrip().endswith("|")):
            raise SystemExit(f"SAFETY.md: a row under {heading!r} is not a pipe-delimited table row: {line!r}")
        table.append(line.rstrip())
    if any(l.startswith("|") for l in section[start + len(table):]):
        raise SystemExit(f"SAFETY.md: more than one table, or a broken table, under {heading!r}")
    if len(table) < 3 or not re.fullmatch(r"\|(\s*-+\s*\|)+", table[1].replace(" ", "")):
        raise SystemExit(f"SAFETY.md: no well-formed table under {heading!r}")
    header = [c.strip() for c in table[0].strip("|").split("|")]
    if header[: len(columns)] != columns:
        raise SystemExit(f"SAFETY.md: table under {heading!r} has columns {header}, expected {columns}")
    rows = []
    for line in table[2:]:
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) != len(header) or not all(cells[: len(columns)]):
            raise SystemExit(f"SAFETY.md: malformed row under {heading!r}: {line!r}")
        rows.append(cells)
    return rows

def clean(text):
    text = re.sub(r"\*\*", "", text)
    text = re.sub(r"\s*\[S\d+\](,\s*\[S\d+\])*", "", text)
    # Section numbers mean nothing inside a lesson; point to the lists on the page instead.
    for a, b in [("Use the referral tiers in section 4.", "Use the referral tiers in this lesson."), ("from section 3 or 4", "in the lists in this lesson"),
                 ("See sections 3 and 4.", "See the lists in this lesson."), ("(section 4 note)", "(see the note on infection)")]:
        text = text.replace(a, b)
    return text.strip()

SAFETY_MD = (ROOT / "docs/curriculum/SAFETY.md").read_text()
TIER = {
    "emergency": [clean(r[0]) for r in safety_table(SAFETY_MD, "### Emergency:", ["Criterion", "Source"])],
    "urgent": [clean(r[0]) for r in safety_table(SAFETY_MD, "### Urgent:", ["Criterion", "Source"])],
    "routine": [clean(r[0]) for r in safety_table(SAFETY_MD, "### Routine:", ["Criterion", "Source"])],
}
STOP_ROWS = [f"{clean(r[0])} - {clean(r[1])}" for r in safety_table(SAFETY_MD, "## 3. Stop rules", ["Stop when", "What the trainer does", "Source"])]
EXCL_ROWS = [f"{clean(r[0])} - {clean(r[1])}" for r in safety_table(SAFETY_MD, "## 2. Excluded populations", ["Population", "Rule", "Source"])]
notes_on_infection = [l for l in SAFETY_MD.split("\n") if l.startswith("Note on infection: ")]
if len(notes_on_infection) != 1:
    raise SystemExit("SAFETY.md: expected one 'Note on infection' line")
INFECTION_NOTE = clean(notes_on_infection[0][len("Note on infection: "):])
TIER_LEAD = {
    "emergency": "Emergency: call emergency services now (999 in the UK).",
    "urgent": "Urgent: an urgent GP appointment or NHS 111 today (or the local equivalent).",
    "routine": "Routine: a GP or physiotherapist (many areas allow self-referral to physiotherapy).",
}
HIGHEST = "Use the highest tier that any sign matches."

# Canonical stop-rule wording, reused beside screens and progressions (SAFETY.md sections 3 and 4).
STOP_SESSION = "Stop shoulder loading for the rest of the session."
WORSENING = "Pain that is getting worse: routine referral now; do not wait."
TWO_WEEKS = "Pain that has not improved after 2 weeks: routine referral."
NIGHT = "Pain and stiffness that do not go away, including pain that is worse at night: routine referral."
TINGLE = "Pins and needles that do not go away, or no feeling in the arm or shoulder: urgent, today."
ACTIVE_LOSS = "A new inability to lift or move the arm themselves, without an injury: urgent, today."
TRAUMA = "After a fall or impact, an arm they cannot move or a shoulder that looks out of place: emergency, now. Do not move the arm or try to put it back."
INJURY_WEAK = "Pain and weakness after an injury, while the arm still moves and looks normal: urgent, today."
UNDER_18 = "Anyone under 18 with shoulder pain: urgent, today; tell a parent or carer."

def stop(*rules):
    return C(REFER, " ".join([f"If pain comes on or rises, or any warning sign appears: {STOP_SESSION}", *rules, "This never clears anyone and never names an injury."]))

# ---------------------------------------------------------------- lesson 1

l1 = {
  "id": "shoulder-01-anatomy", "slug": "shoulder-anatomy", "title": "Shoulder anatomy a trainer needs",
  "summary": "A working map of the shoulder: three bones, three joints and a gliding contact on the ribcage, the cuff that steadies the ball and socket, and the big muscles that move the arm and the shoulder blade.",
  "durationMinutes": 12, "format": "article",
  "objectives": [
    "Name the bones and joints of the shoulder in plain words and in standard terms.",
    "Describe the small socket and what deepens it.",
    "Describe what the rotator cuff muscles do for the joint.",
    "Find the main landmarks on yourself and, with permission, on a client."],
  "anatomyIds": ["UBERON:0001467", "UBERON:0001470", "UBERON:0003692", "UBERON:0001469", "UBERON:0006849", "UBERON:0000976", "UBERON:0011959", "UBERON:0003683"],
  "blocks": [
    P("This lesson gives you a working map of the shoulder: where the bones meet, what supports the ball and socket, and which muscles do the moving. Every later lesson in this module uses this map."),
    H("Three bones, three joints and a gliding contact"),
    S("Three bones make the shoulder: the upper arm bone (humerus), the shoulder blade (scapula) and the collarbone (clavicle). The ball-and-socket joint (glenohumeral joint) joins the arm to the shoulder blade. The acromioclavicular joint joins the collarbone to the bony tip at the top of the shoulder blade (the acromion), and the sternoclavicular joint joins the collarbone to the breastbone. There is no direct bony joint between the shoulder blade and the ribcage; muscles connect them.", "claim-slot:l1-bones-joints"),
    S("The shoulder blade also slides over the back of the ribcage. That gliding contact is often called the scapulothoracic joint, but it has no cartilage, joint lining or capsule: the shoulder blade slides on layers of muscle and bursae, and muscles hold it in place.", "claim-slot:l1-scapulothoracic"),
    D("shoulder-complex-front",
      "Schematic line drawing of a left shoulder seen from the front. The collarbone runs from the breastbone to the top of the shoulder blade. The ball at the top of the upper arm bone sits against a small socket on the shoulder blade, which lies behind the ribs.",
      "The shoulder complex, left shoulder seen from the front: the subject's left is on your right. Schematic, not to scale.",
      [("sternoclavicular", "Sternoclavicular joint.", "The collarbone meets the breastbone."),
       ("acromioclavicular", "Acromioclavicular joint.", "The collarbone meets the acromion, the bony tip at the top of the shoulder blade."),
       ("glenohumeral", "Glenohumeral joint.", "The ball and socket (highlighted)."),
       ("scapula", "Shoulder blade.", "It lies behind the ribs (dashed), with no bony joint to them.")],
      "claim-slot:l1-bones-joints", "claim-slot:l1-scapulothoracic"),
    H("A small, shallow socket"),
    S("The ball-and-socket joint is the most mobile joint in the body, partly because its bones hold it so loosely. Its socket on the shoulder blade (the glenoid) has a joint surface only a third to a quarter of the size of the ball at the top of the humerus. A rim of fibrocartilage around it, the labrum, adds to the socket's depth and surface.", "claim-slot:l1-shallow-socket"),
    P("A picture some coaches use with clients: a ball resting on a saucer rather than sitting in a cup. Use it if it helps; it is a teaching image, not a description of the anatomy."),
    H("The rotator cuff"),
    S("Four muscles form the rotator cuff: supraspinatus, infraspinatus, teres minor and subscapularis. They start on the shoulder blade and attach to the top of the humerus, forming a cuff around the ball-and-socket joint, and they are crucial for the joint's stability as the arm moves.", "claim-slot:l1-cuff"),
    S("Pressing the ball into the socket makes the joint more stable, and muscle contraction can provide that pressing force. Researchers call this concavity compression.", "claim-slot:l1-concavity"),
    C("Coach note", "You will hear people blame one cuff muscle for every shoulder complaint. Describe what you see instead, and leave the cause to a clinician."),
    D("shoulder-cuff",
      "Two schematic views of a left shoulder. From the front, subscapularis covers the front of the shoulder blade and crosses to the top of the upper arm bone. From behind, supraspinatus, infraspinatus and teres minor run from the shoulder blade to the top of the upper arm bone.",
      "The four rotator cuff muscles, left shoulder from the front and from behind. Schematic, not to scale.",
      [("front-view", "From the front.", "The subject's left is on your right."),
       ("subscapularis", "Subscapularis.", "On the front of the shoulder blade."),
       ("humeral-head", "Top of the humerus.", "Where the four cuff muscles attach."),
       ("back-view", "From behind.", "The subject's left is on your left."),
       ("supraspinatus", "Supraspinatus.", "Above the spine of the shoulder blade."),
       ("infraspinatus", "Infraspinatus.", "Below the spine."),
       ("teres-minor", "Teres minor.", "Along the outer border, below infraspinatus.")],
      "claim-slot:l1-cuff"),
    H("The big movers"),
    S("The middle part of the deltoid, with the supraspinatus, lifts the arm out to the side. The pectoralis major is the main muscle that draws the arm in toward the body from the front, and the latissimus dorsi, with the back of the deltoid and the teres major, draws the arm backward. On the shoulder blade, the serratus anterior pulls it forward around the ribs and rotates it upward, and the trapezius raises it, draws it back and rotates it upward.", "claim-slot:l1-movers"),
    H("Why it matters"),
    P("On the gym floor, load the range a client can control, and train the muscles that move the shoulder blade as well as the ones that move the arm."),
    H("How to see it"),
    P("Find the landmarks on yourself first. With a client, ask before you touch, say what you are touching, and offer to let them find it themselves."),
    L(["Follow the collarbone out from the base of the neck to the bony point at the top of the shoulder (acromion).",
       "Find the ridge that runs across the back of the shoulder blade (spine of the scapula).",
       "Find the bottom tip of the shoulder blade (inferior angle). Keep a finger near it while the arm rises, and feel it move.",
       "Find the front of the shoulder, just below the outer end of the collarbone."]),
    stop(TRAUMA, ACTIVE_LOSS, TINGLE, WORSENING, "If a client points to a painful spot, describe where it is and how it behaves; never name an injury."),
    H("What to do"),
    P("Use plain names with clients and standard names with clinicians. \"The ball-and-socket joint\" and \"the glenohumeral joint\" are the same thing. Saying both helps when a client brings you notes from a physiotherapist or doctor."),
    H("Check your understanding"),
    Q("Which joint joins the upper arm bone to the shoulder blade?", ["Acromioclavicular joint", "Glenohumeral joint", "Sternoclavicular joint"], 1,
      "The glenohumeral joint is the ball-and-socket joint between the humerus and the glenoid of the shoulder blade.", "claim-slot:l1-bones-joints"),
    Q("What adds depth to the small socket of the shoulder?", ["The labrum", "The acromion", "The collarbone", "The deltoid"], 0,
      "The labrum is a rim of fibrocartilage around the glenoid that adds to the socket's depth and surface.", "claim-slot:l1-shallow-socket"),
    Q("What do the rotator cuff muscles do for the shoulder joint?", ["They form a cuff around the joint and are crucial for its stability as the arm moves", "They lock the shoulder blade so it cannot move", "Nothing; ligaments alone hold the joint"], 0,
      "The four cuff muscles run from the shoulder blade to the humerus, forming a cuff around the joint that is crucial for its stability.", "claim-slot:l1-cuff"),
    C("Talk it through", "A client points to the front of the shoulder and asks: \"Is that my rotator cuff?\" What do you say? A good answer describes the area in plain words, says that you do not diagnose, and asks how it behaves in training. If it hurts during training, stop shoulder loading for the session and use the stop-and-refer rules."),
  ],
  "media": [], "resources": [OPENSTAX_READING],
}
l1_slots = [
  {"slot": "claim-slot:l1-bones-joints", "statement": "The shoulder comprises the humerus, scapula and clavicle, articulating at the glenohumeral, acromioclavicular and sternoclavicular joints; there is no osseous or ligamentous joint between the scapula and the thorax, which are connected by muscles.", "candidateSources": [FRANK]},
  {"slot": "claim-slot:l1-scapulothoracic", "statement": "The scapulothoracic articulation has no articular cartilage, synovium or capsule; the scapula slides on bursal and muscular planes and is held in place by its muscular attachments.", "candidateSources": [FRANK]},
  {"slot": "claim-slot:l1-shallow-socket", "statement": "The glenohumeral joint is the most mobile joint in the body, owing partly to its lack of osseous constraint; the glenoid articular surface is one third to one quarter the size of the humeral head, and the fibrocartilaginous labrum increases its depth and surface area.", "candidateSources": [FRANK, HOWELL]},
  {"slot": "claim-slot:l1-cuff", "statement": "The rotator cuff comprises supraspinatus, infraspinatus, teres minor and subscapularis, which originate on the scapula and attach to the humerus, forming a cuff around the glenohumeral joint that is crucial for shoulder stability.", "candidateSources": [CAVANAUGH, FRANK]},
  {"slot": "claim-slot:l1-concavity", "statement": "Compressing the humeral head into the glenoid concavity stabilises the glenohumeral joint (concavity compression), and dynamic muscle contraction can provide the compressive load.", "candidateSources": [LIPPITT]},
  {"slot": "claim-slot:l1-movers", "statement": "Middle deltoid and supraspinatus abduct the arm; latissimus dorsi, posterior deltoid and teres major extend it; pectoralis major is the major ventral shoulder adductor; serratus anterior protracts and upwardly rotates the scapula; trapezius elevates, retracts and upwardly rotates it.", "candidateSources": [VIJIAN, JACINTO, FRANK]},
]
l1_scen = [{"prompt": "A client points to the front of the shoulder and asks: \"Is that my rotator cuff?\"", "goodAnswer": "Describe the area; say you do not diagnose; ask how it behaves. If it hurts during training: stop shoulder loading for the session and apply the referral tiers.", "safety": "SAFETY.md sections 1 and 3"}]
notes1 = ["Claim status (W1 dry run): all six lesson 1 claims are blocked. Their sources are narrative reviews, primary studies or a brief report, which the claim pipeline does not admit, and no systematic review states these basic anatomy facts. They need a textbook source (kind textbook, with edition and page) once the pipeline can take one; until then lesson 1 cannot publish. The text is kept rather than relabelled as practice.",
          "Anatomy claims rest on open CC BY reviews read in full through Europe PMC (Frank 2013, Cavanaugh 2024, Vijian 2023, Jacinto 2022) plus two abstracts. OpenStax is not a claim source (its terms forbid ingestion into AI models); it appears only as an optional further-reading link with its CC BY-NC-SA 4.0 licence.",
          "The scapulothoracic statement is restored because Frank 2013 states it; 'most of the force' stays removed. The capsule statement was dropped: no open source read states it.",
          "Diagram shoulder-complex-front is the original drawing in apps/web, on main since PR #17 (08747d7; the subject's left shoulder from the front), so the caption describes an existing figure. Every diagram is a reviewed diagram block (Sol R16): alt, caption and legend live here; the drawings in apps/web carry geometry and anchors only. shoulder-cuff (cuff only) replaces the planned shoulder-cuff-and-movers slot."]

# ---------------------------------------------------------------- lesson 2

l2 = {
  "id": "shoulder-02-rhythm", "slug": "scapulohumeral-rhythm", "title": "Scapulohumeral rhythm",
  "summary": "When the arm goes up, the shoulder blade moves with it. Learn what that shared movement looks like and how to watch it.",
  "durationMinutes": 12, "format": "article",
  "objectives": [
    "Describe the shoulder blade movements that happen as the arm is raised.",
    "Explain that raising the arm is shared with the shoulder blade, and that the share varies between people.",
    "Watch a client raise their arms and describe what you see in plain words.",
    "Explain why a visible difference in shoulder blade movement is something to watch and re-check, not a diagnosis."],
  "anatomyIds": ["UBERON:0001467", "UBERON:0001470", "UBERON:0006849"],
  "blocks": [
    P("Raise your arm overhead and the shoulder blade comes along. Watching that shared movement is a useful coaching skill, as long as you remember what it can and cannot tell you."),
    H("The shoulder blade moves too"),
    S("When the arm is raised, the shoulder blade does not stay still. From the very start of the raise it rotates upward, so the socket turns to face more toward the ceiling, and it tilts backward. It also tends to turn outward around the ribcage.", "claim-slot:l2-scapular-motions"),
    D("scapula-upward-rotation",
      "Three schematic drawings of a right shoulder blade seen from behind, with the arm by the side, level with the shoulder and overhead. The shoulder blade is rotated upward more at each position.",
      "The shoulder blade at three arm positions, right shoulder blade seen from behind. Schematic; angles are illustrative.",
      [("arm-by-side", "Arm by the side.", ""),
       ("arm-level", "Arm level with the shoulder.", "The shoulder blade has rotated upward."),
       ("arm-overhead", "Arm overhead.", "It has rotated upward further.")],
      "claim-slot:l2-scapular-motions"),
    H("A shared movement"),
    S("Raising the arm is shared with the shoulder blade. A review that pooled studies of people without shoulder pain estimated that the arm rises about three degrees for every degree the shoulder blade rotates upward. Shoulder blade movement varied a lot between people, and the review did not support a fixed ratio.", "claim-slot:l2-shared-ratio"),
    P("Do not count degrees on the gym floor. Watch whether the arm and the shoulder blade move together."),
    H("Different does not mean injured"),
    S("Changes in how the shoulder blade moves, often called scapular dyskinesis, are present in a high percentage of shoulder injuries. An international consensus statement concluded that their exact role in causing or worsening shoulder problems is not clearly defined.", "claim-slot:l2-dyskinesis"),
    P("So treat a visible difference as something to watch and re-check, not as a diagnosis. It never tells you on its own what is wrong, or that nothing is."),
    H("How to see it"),
    L(["Stand behind the client. Ask first; a fitted top lets you see the shoulder blades without asking anyone to undress.",
       "Ask them to raise both arms slowly forward and up, then lower them, 3 to 5 times.",
       "Watch both shoulder blades: do they start moving at a similar time and travel a similar amount?",
       "On the way down, watch the inner edge and the bottom tip of each shoulder blade. Do they stay close to the ribs or lift away?",
       "If differences are hard to see, a light dumbbell in each hand can make them clearer.",
       "Write down what you saw in plain words, for example: \"left shoulder blade lifts away from the ribs on the way down.\""]),
    stop(WORSENING, TWO_WEEKS, TINGLE, ACTIVE_LOSS, TRAUMA),
    H("What to do: cues for overhead work"),
    P("\"Shoulder blades back and down\" is a common cue, and it helps some lifters set up for a bench press. Overhead, the same cue can fight the upward rotation described above. For overhead reaching, try \"reach long through your hands\" or \"let your shoulder blades travel with your arms\"."),
    P("Give one cue, watch the next rep, and keep the cue only if the movement changes the way you want. If it does not, drop it and try a different position or a lighter load."),
    H("Check your understanding"),
    Q("Which two shoulder blade movements happen consistently as the arm is raised overhead?", ["Upward rotation and backward tilt", "Downward rotation and forward tilt", "None: the shoulder blade stays still"], 0,
      "From the start of the raise, the shoulder blade rotates upward and tilts backward, and it tends to turn outward around the ribcage.", "claim-slot:l2-scapular-motions"),
    Q("How is raising the arm shared with the shoulder blade?", ["A fixed ratio in everyone", "On average about three degrees of arm rise per degree of shoulder blade rotation, with large differences between people", "The shoulder blade does most of the work"], 1,
      "Pooled studies of people without shoulder pain estimated about 3:1 on average, but shoulder blade movement varied a lot between people, so no fixed ratio holds.", "claim-slot:l2-shared-ratio"),
    Q("What did an international consensus statement conclude about scapular dyskinesis?", ["It is present in a high percentage of shoulder injuries, but its exact role in causing or worsening them is not clearly defined", "It always causes shoulder injury", "It is never seen with shoulder injuries"], 0,
      "It is common in shoulder injuries, but its exact role in causing or worsening shoulder problems is not clearly defined.", "claim-slot:l2-dyskinesis"),
    C("Talk it through", "One shoulder blade lifts a little from the ribs as a client lowers from overhead. They have no pain and no other warning signs. Do you continue, adjust or refer? Now change one thing: the shoulder aches more with each rep. What do you do first, and what happens next?"),
  ],
  "media": [], "resources": [],
}
l2_slots = [
  {"slot": "claim-slot:l2-scapular-motions", "statement": "In asymptomatic individuals, the scapula moves from the very beginning of arm elevation toward upward rotation and posterior tilt, with a trend toward external rotation.", "candidateSources": [FERNANDEZ],
   "note": "Replaces Ludewig 2009 (narrative review) and McClure 2001 (primary study), which the claim pipeline does not admit."},
  {"slot": "claim-slot:l2-shared-ratio", "statement": "In asymptomatic individuals, a systematic review with multilevel meta-regression estimated the ratio of humerothoracic elevation to scapular upward rotation at about 2.9:1 to 3.1:1, found great variability in scapular kinematics, and did not support a constant 3:1 scapulohumeral rhythm.", "candidateSources": [FERNANDEZ],
   "note": "Replaces Inman 1944 (no abstract) and McQuade 1998 (primary study). The ratio is humerothoracic elevation to scapular upward rotation, not the classic glenohumeral-to-scapulothoracic 2:1."},
  {"slot": "claim-slot:l2-dyskinesis", "statement": "Scapular dyskinesis is present in a high percentage of shoulder injuries, but its exact role in causing or worsening shoulder dysfunction is not clearly defined.", "candidateSources": [KIBLER],
   "note": "Wording Sol approved on Kibler alone in the claim dry run (round 3). Plummer 2017 (primary study) is dropped; no claim about people without pain or about identifying injury."},
]
l2_scen = [
  {"prompt": "One shoulder blade lifts a little from the ribs as a client lowers from overhead; no pain, no warning signs.", "goodAnswer": "Continue with a load and range they control; note it; no referral without warning signs.", "safety": "SAFETY.md sections 1 and 3"},
  {"prompt": "Same client, but the shoulder aches more with each rep.", "goodAnswer": "Stop shoulder loading for this session. If the pain is getting worse: routine referral now (GP or physiotherapist). If it has not improved after 2 weeks: routine referral. Urgent or emergency if those signs appear.", "safety": "SAFETY.md sections 3 and 4"},
]
notes2 = ["The force-couple section and its quiz were removed: no accessible source stated the named-muscle formulation (Ludewig's full text could not be retrieved; OpenStax's table contradicts it).",
          "Diagram scapula-upward-rotation is the original drawing in apps/web, on main since PR #17 (08747d7), so the caption describes an existing figure."]

# ---------------------------------------------------------------- lesson 3

l3 = {
  "id": "shoulder-03-mobility-stability", "slug": "mobility-and-stability", "title": "Mobility and stability: common restrictions",
  "summary": "A missing range is a question to look into, not a label. Learn to tell range from control, what research says about posture, and when a restriction needs referral instead of training.",
  "durationMinutes": 12, "format": "article",
  "objectives": [
    "Tell active range from passive range, and range from control.",
    "Recognise the restrictions trainers often see: overhead reach, reaching behind the back, reaching across the body.",
    "State what reviews found about upper-back posture and shoulder pain, and what they did not show.",
    "Decide when a restriction is a training question and when it needs referral."],
  "anatomyIds": ["UBERON:0001467", "UBERON:0001470", "UBERON:0006849"],
  "blocks": [
    P("A client cannot get the bar overhead, or one hand stops short behind the back. Before you reach for a stretch, ask: is this new? Then ask how far the shoulder goes, and how well the client controls it there."),
    H("Two coaching questions"),
    P("In coaching terms, mobility is the range a client can reach, and stability is how well they control that range, especially under load. Ask both questions; the answer to one changes what you do about the other."),
    H("Active and passive range"),
    P("Active range is how far the client moves the arm on their own. Passive range is how far it goes when someone else moves it, with the client relaxed. A difference between them is a reason to look closer. It is not a prescription, and this lesson draws no training rule from it."),
    C(REFER, f"{STOP_SESSION} A client who can no longer lift or move the arm themselves, even though you could move it for them, with no injury: urgent, an urgent GP appointment or NHS 111 today. It is never something to train. {TRAUMA}"),
    H("What research says about posture"),
    S("A 2016 systematic review found moderate evidence of no significant difference in how rounded the upper back is (thoracic kyphosis) between people with and without shoulder pain. A result that is not significant does not prove the two groups are the same, and the studies varied in quality. A 2024 review of cross-sectional studies found conflicting results for thoracic posture. These findings are about association; they do not show that posture causes or prevents shoulder pain.", "claim-slot:l3-kyphosis-pain"),
    S("In the single-session studies a 2016 review gathered, people reached more maximum shoulder range when sitting or standing upright than when slouched, with or without shoulder pain. Whether that matters over weeks of training is not known.", "claim-slot:l3-upright-range"),
    C("Coach note", "Avoid telling clients that their posture is damaging their shoulder; the research above does not show that. You can still use an upright set-up when it helps a lift, as a coaching choice."),
    H("Common restrictions you will see"),
    L(["Overhead reach: the arms stop short of vertical, or the lower back arches to get there.",
       "Reaching behind the back: one hand stops lower on the spine than the other.",
       "Reaching across the body: one elbow stops further from the opposite shoulder."]),
    H("How to see it"),
    D("reach-screens",
      "Three schematic figures: standing with the back against a wall, arms raised but short of vertical; lying on the back with knees bent, arms overhead toward the floor; standing with one arm raised and supported at the elbow and wrist, with a dashed line showing further range.",
      "Three ways to see reach. Schematic, not to scale.",
      [("wall-reach", "Wall reach.", "Back against the wall; raise both arms forward and up."),
       ("hands-stop", "Where the hands stop.", "Note it; the dashed line is the full range."),
       ("lower-back", "Lower back.", "Note whether it leaves the wall."),
       ("lying-reach", "Lying reach.", "On the back, knees bent; arms overhead toward the floor behind."),
       ("active-passive", "Active then passive.", "The client's own raise, then the arm supported (dashed: further range)."),
       ("support", "Support at the elbow and wrist.", "Only with permission. Never push; stop at the first discomfort.")]),
    L(["Ask first: is this new, and does it hurt? If it is new, unexplained or painful, go to the stop-and-refer rules before any screen.",
       "Wall reach: the client stands with their back against a wall, then raises both arms forward and up as far as is comfortable. Note where the hands stop and whether the lower back leaves the wall.",
       "Lying reach: the client lies on their back with knees bent and raises both arms overhead toward the floor behind them. Compare sides.",
       "Active then passive, only with permission: after the client raises the arm on their own, support it at the elbow and wrist and see whether it goes further without pain. Never push; stop at the first discomfort.",
       "Write down what you saw in plain words, for example: \"right hand stops about a hand's width short of the wall overhead.\""]),
    stop(WORSENING, TWO_WEEKS, NIGHT, ACTIVE_LOSS, TINGLE),
    H("What to do"),
    P("For a long-standing, familiar restriction that does not hurt and shows no warning sign: train in the range the client controls, change one thing at a time, and re-check in a later session. Anything new, unexplained or painful goes to the stop-and-refer rules first."),
    P("Some coaching systems explain restrictions with fascial lines or rib position. Evidence for these as explanations of why a shoulder is restricted is limited. Use them, if at all, as coaching language with clients, not as a description of how the body works."),
    H("Check your understanding"),
    Q("A 2016 systematic review compared upper-back rounding (thoracic kyphosis) in people with and without shoulder pain. What did it find?", ["People with shoulder pain had much more rounded upper backs", "No significant difference between the groups, with moderate evidence; that does not prove the groups are the same", "Rounding causes shoulder pain"], 1,
      "The review found moderate evidence of no significant difference in thoracic kyphosis between people with and without shoulder pain. That does not prove the groups are the same, and it does not show cause either way.", "claim-slot:l3-kyphosis-pain"),
    Q("In the single-session studies a 2016 review gathered, how did upright posture compare with slouching for maximum shoulder range?", ["More range when upright; whether it matters over time is not known", "Less range when upright", "No difference"], 0,
      "People reached more maximum range upright than slouched in single sessions; the long-term relevance is unclear.", "claim-slot:l3-upright-range"),
    C("Talk it through", "A client cannot reach fully overhead on either side. With permission you can lift both arms higher, and nothing hurts. What do you ask before you plan anything? Now change one thing: since last week, with no injury, the client cannot lift the right arm themselves at all, though you can still lift it for them. What do you do?"),
  ],
  "media": [], "resources": [],
}
l3_slots = [
  {"slot": "claim-slot:l3-kyphosis-pain", "statement": "A 2016 systematic review found moderate evidence of no significant difference in thoracic kyphosis between people with and without shoulder pain; a non-significant result does not establish equivalence and study quality varied. A 2024 review of cross-sectional studies found conflicting results for thoracic posture. Both concern association, not causation.", "candidateSources": [BARRETT, FIALHO],
   "note": "Current-evidence check, 2026-10-11: PubMed search for systematic reviews 2017-2026 on thoracic posture or kyphosis and shoulder pain found Fialho 2024 (conflicting thoracic posture findings, very low-quality evidence), consistent with Barrett; no review overturns it."},
  {"slot": "claim-slot:l3-upright-range", "statement": "In single-session studies gathered by a 2016 systematic review, maximum shoulder range of motion was greater in erect than in slouched postures, in people with and without shoulder pain; long-term relevance is unclear.", "candidateSources": [BARRETT], "note": "Dated finding; keep the single-session and unclear-relevance qualifiers."},
]
l3_scen = [
  {"prompt": "Both arms stop short overhead; passive range is higher and painless; long-standing; no warning sign.", "goodAnswer": "Ask whether it is new or painful. If long-standing and painless with no warning sign: train in the controlled range, change one thing, re-check in a later session.", "safety": "SAFETY.md sections 1 and 3"},
  {"prompt": "Since last week, with no injury, the client cannot lift the right arm themselves at all, though you can lift it for them.", "goodAnswer": "Stop shoulder loading; urgent: an urgent GP appointment or NHS 111 today.", "safety": "SAFETY.md sections 3 and 4"},
  {"prompt": "Over several weeks, lifting the arm has become very difficult, but the client can still lift it themselves; no other warning sign.", "goodAnswer": "Stop shoulder loading for the session; routine referral to a GP or physiotherapist.", "safety": "SAFETY.md section 4"},
  {"prompt": "Stiffness for months with pain at night, slowly getting worse.", "goodAnswer": "Stop shoulder loading for the session; routine referral now because it is getting worse.", "safety": "SAFETY.md sections 3 and 4"},
]
notes3 = ["Science sections are removed, never relabelled, if their claims are not approved.", "Fascial and rib-position models carry the limited-evidence note STYLE.md requires."]

# ---------------------------------------------------------------- lesson 4

def tier_callout(tier):
    return C(tier.capitalize(), " ".join([TIER_LEAD[tier], *(f"{item}." if not item.endswith(".") else item for item in TIER[tier]), HIGHEST]))

l4 = {
  "id": "shoulder-04-screens-red-flags", "slug": "screens-and-red-flags", "title": "Assessments, screens and red flags",
  "summary": "Screens show a trainer where to look and when to stop. They never diagnose and never clear anyone. Learn three simple screens, the questions to ask first, and the warning signs that end the session.",
  "durationMinutes": 15, "format": "article",
  "objectives": [
    "Ask the questions that bring warning signs to light before you train the shoulder.",
    "Run three simple screens, each with a clear start position and what to look for.",
    "Describe what research found about clinicians' shoulder examination tests, and why a trainer's screen never diagnoses or clears anyone.",
    "Choose the right referral tier from what you see and hear."],
  "anatomyIds": ["UBERON:0001467", "UBERON:0001470"],
  "blocks": [
    P("A screen is a short, repeatable look at how a shoulder moves today. It helps you choose a starting point and notice change. It is not a test, and it is never the reason someone is allowed to train."),
    H("What research says about examination tests"),
    S("A 2024 review of the physical examination tests clinicians use for rotator cuff tears and subacromial pain found the evidence mostly low in quality. Some tests helped clinicians rule a rotator cuff tear in. An earlier 2012 review concluded that no single test could be recommended on its own for a definitive diagnosis.", "claim-slot:l4-exam-tests"),
    P("A trainer's screen is not one of those tests. It shows how a movement looks today. It never diagnoses, it never clears anyone for training, and a \"normal\" screen does not outweigh a warning sign."),
    H("Before you screen: ask"),
    L(["Did anything happen to the shoulder recently: a fall, an impact, a joint that popped out?",
       "Any pins and needles, numbness or loss of feeling in the arm or hand?",
       "Is there anything you cannot do with the arm that you could do recently, like lifting it yourself?",
       "Does it hurt at night, or is it getting worse?",
       "Do you have a fever or feel unwell? Any chest pain or breathlessness?",
       "Is a doctor or physiotherapist treating this shoulder or your neck, or have you had surgery on it?",
       "For younger clients: are you under 18?"]),
    tier_callout("emergency"),
    tier_callout("urgent"),
    tier_callout("routine"),
    C("Outside this module", "Recent surgery or a recent dislocation or fracture still in rehabilitation, a diagnosed neurological condition, or a diagnosed shoulder condition under current care: work only within the treating clinician's plan, and do not progress it on your own. Anyone under 18 with shoulder pain: urgent, as above."),
    D("screen-start-positions",
      "Four schematic figures: standing relaxed seen from behind with both shoulder blades highlighted; standing seen from the right side with the right elbow bent to a right angle; and two figures seen from behind reaching with the right hand over the shoulder and behind the back.",
      "The three screens; where one arm is used, the right arm is shown. Schematic, not to scale.",
      [("screen-1", "Screen 1, arm raise.", "Stand behind the client: arms by the sides, shoulder blades visible (highlighted)."),
       ("screen-2", "Screen 2, rotation range.", "Elbow at the side, bent to a right angle, thumb up."),
       ("screen-3-over", "Screen 3, over the shoulder.", "Reach over the shoulder to the upper back; note where the fingertips reach."),
       ("screen-3-behind", "Screen 3, behind the back.", "Reach behind the back and up the spine; note where the thumb reaches. One side at a time.")]),
    H("Screen 1: arm raise from behind"),
    L(["Start: the client stands relaxed, arms by the sides, in a top that lets you see the shoulder blades. Stand behind them.",
       "Ask them to raise both arms forward and up as far as is comfortable, then lower slowly. Three to five times.",
       "Look for: how high each arm goes, whether both shoulder blades move at a similar time and amount, and whether one lifts away from the ribs on the way down.",
       "A side-to-side difference tells you where to look in training. It does not tell you why."]),
    stop(ACTIVE_LOSS, TRAUMA, TINGLE, WORSENING),
    H("Screen 2: rotation range"),
    L(["Start: the client stands with the elbow at the side, bent to a right angle, thumb up.",
       "Ask them to turn the forearm outward, then inward across the body, without moving the elbow. Compare sides.",
       "Then, if comfortable, with the arm out to the side at shoulder height and the elbow bent, ask them to rotate the hand up and down. Compare sides.",
       "The client moves the arm; you do not push it.",
       "For throwing athletes, read lesson 7 before drawing any conclusion from a difference between sides."]),
    stop(INJURY_WEAK, ACTIVE_LOSS, WORSENING),
    H("Screen 3: reach patterns"),
    L(["Start: the client stands relaxed.",
       "Reach over the shoulder to touch the upper back, one side at a time. Note where the fingertips reach.",
       "Reach behind the back and up the spine, one side at a time. Note where the thumb reaches.",
       "Compare sides, and compare with last time."]),
    stop(TWO_WEEKS, NIGHT, "Severe pain in both shoulders, or new pain, swelling or stiffness in several joints at once: urgent, today."),
    H("What to do with what you saw"),
    P("Write down what you saw in plain words, without a diagnosis. Then choose: train as planned, adjust the plan for a later session, or refer, and say which tier. Re-check the same screen the same way in a later session."),
    H("Saying it"),
    L(["Urgent: \"You can't lift your arm yourself today, and that's new. We'll stop the shoulder work now. Please get it checked today: call your GP for an urgent appointment, or NHS 111.\"",
       "Routine, with no other warning sign: \"Your shoulder hasn't improved in two weeks. Book in with your GP or a physiotherapist. Today we'll leave the shoulder out of training.\"",
       "Emergency: call emergency services yourself, stay with the client, and follow the emergency list above.",
       "Never name a condition, and never say it is nothing."]),
    H("Check your understanding"),
    Q("What did a 2024 review find about clinicians' physical examination tests for rotator cuff tears and subacromial pain?", ["The evidence was mostly low in quality, and some tests helped rule a rotator cuff tear in", "Every test is accurate on its own", "No test gave any useful information"], 0,
      "The review found mostly low-quality evidence; some tests helped clinicians rule in a rotator cuff tear.", "claim-slot:l4-exam-tests"),
    C("Talk it through", "Pick the tier for each, and say what you do first: (1) after a fall in class, the shoulder looks out of place; (2) after catching a heavy bar, pain and weakness lifting the arm, but it still moves and looks normal; (3) pins and needles in the arm that have not gone away; (4) a mild ache after last week's pressing that settled within a day, with no pain during sets; (5) pain that has not improved after 2 weeks of leaving out the movements that provoke it; (6) a 16-year-old says the shoulder hurts after training. Then: could a careful screen ever clear a client for training?"),
  ],
  "media": [], "resources": [],
}
l4_slots = [
  {"slot": "claim-slot:l4-exam-tests", "statement": "A 2024 systematic review and meta-analysis found mostly low-quality evidence for physical examination tests for rotator cuff tears and subacromial impingement, with some tests (for example the external rotation lag sign at 90 degrees) showing useful rule-in accuracy for cuff tears; a 2012 review concluded that no single test could be unequivocally recommended for a definitive diagnosis.", "candidateSources": [ZHAO, HEGEDUS],
   "note": "Condition-specific: rotator cuff tears and subacromial pain only. Zhao is the primary, open source; Hegedus is historical context."},
]
l4_scen = [
  {"prompt": "After a fall in class, the shoulder looks out of place.", "goodAnswer": "Stop; emergency: call emergency services now; do not move the arm or try to put it back; do not let them drive.", "safety": "SAFETY.md section 4"},
  {"prompt": "After catching a heavy bar: pain and weakness lifting the arm; it still moves and looks normal.", "goodAnswer": "Stop shoulder loading; urgent: an urgent GP appointment or NHS 111 today.", "safety": "SAFETY.md sections 3 and 4"},
  {"prompt": "Pins and needles in the arm that have not gone away.", "goodAnswer": "Stop shoulder loading; urgent: an urgent GP appointment or NHS 111 today.", "safety": "SAFETY.md section 4"},
  {"prompt": "A mild ache after last week's pressing that settled within a day; no pain during sets; no warning signs.", "goodAnswer": "Continue; consider load or range for this session; stop shoulder loading if pain comes on during a set.", "safety": "SAFETY.md section 3"},
  {"prompt": "Pain that has not improved after 2 weeks of leaving out the provoking movements.", "goodAnswer": "Stop shoulder loading for this session; routine referral: a GP or physiotherapist.", "safety": "SAFETY.md section 4"},
  {"prompt": "A 16-year-old says the shoulder hurts after training.", "goodAnswer": "Stop shoulder loading; urgent: tell a parent or carer; an urgent GP appointment or NHS 111 the same day for referral to trauma and orthopaedics.", "safety": "SAFETY.md sections 2 and 4"},
  {"prompt": "Could a careful screen ever clear a client for training?", "goodAnswer": "No. A trainer's screen shows how a movement looks today; it never diagnoses or clears anyone (Spindle policy, SAFETY.md section 1).", "safety": "SAFETY.md section 1"},
]
notes4 = ["The tier callouts are generated from SAFETY.md, so they match it exactly.", "The scope question ('can a screen clear a client?') is an ungraded discussion item, not a graded science question.", "Every screen has its own stop-and-refer block beside it."]

# ---------------------------------------------------------------- lesson 5

l5 = {
  "id": "shoulder-05-correctives", "slug": "correctives-and-activation", "title": "Correctives and activation: what the evidence supports",
  "summary": "What exercise research on shoulder pain actually compared, how certain it is, and how to use activation drills as a warm-up rather than a fix.",
  "durationMinutes": 12, "format": "article",
  "objectives": [
    "Describe what research reports about exercise for subacromial and rotator cuff related shoulder pain, for whom, and how certain it is.",
    "Explain why that clinical research is not a trainer's treatment plan.",
    "Use activation drills as warm-up and rehearsal, without ranking them.",
    "Know when a \"corrective\" should be a referral instead."],
  "anatomyIds": ["UBERON:0001467", "UBERON:0003683", "UBERON:0006849"],
  "blocks": [
    P("\"Correctives\" and \"activation\" are some of the most used words in shoulder training. This lesson separates what research tested from what is coaching practice, so you can use both honestly."),
    H("What research reports, and for whom"),
    S("For subacromial shoulder pain, a specific condition that a clinician diagnoses, UK specialist guidance from the British Elbow & Shoulder Society reports evidence that exercise reduces pain in the short term (8 weeks to 6 months) and improves function. It rates that recommendation as conditional, based on low-certainty evidence, and says the most effective exercise approach remains uncertain.", "claim-slot:l5-subacromial-exercise"),
    S("For adults whose subacromial pain had lasted more than three months, a systematic review with meta-analysis found high-certainty evidence that surgery to decompress the space gave no additional benefit over placebo surgery, for pain at one year or for physical function at one to two years.", "claim-slot:l5-decompression"),
    S("For rotator cuff related shoulder pain, a 2020 systematic review compared each kind of exercise with placebo or no treatment, not with each other, over more than six weeks and up to six months. Progressive and resisted exercise showed an uncertain clinical benefit; non-progressive or non-resisted exercise showed no significant benefit. The certainty of the evidence was low.", "claim-slot:l5-progressive-comparisons"),
    C(POLICY, BOUNDARY),
    H("What activation is for"),
    P("In a session, use activation drills as rehearsal and warm-up: a way to get the client's attention on a position before loading it. Do not present them as a fix, and keep them short."),
    H("How to see it"),
    P("Can the client hold the position you want under a light load, with smooth movement and no pain? Re-check the screen from lesson 4 the same way in a later session to see whether anything changed."),
    stop(WORSENING, TWO_WEEKS, ACTIVE_LOSS, TINGLE),
    H("A short shoulder warm-up"),
    D("shoulder-warm-up",
      "Four schematic figures: standing with the back against a wall; seen from the front with the right elbow at the side and the forearm turned out against a band; reaching both arms forward; pressing one arm overhead with a light weight.",
      "A short warm-up, in order. Schematic, not to scale.",
      [("position", "Position.", "The stance or support of the first lift."),
       ("rotation", "Light rotation.", "Elbow at the side, forearm out and back."),
       ("band", "Light band.", "Anchored on the other side."),
       ("shoulder-blades", "Shoulder blade control.", "Reach forward, then overhead along a wall."),
       ("first-pattern", "First pattern.", "The session's first press or pull, with a light load.")]),
    L(["Position: set up the stance or support you will use in the first lift. Easier version: support the back against a wall or bench.",
       "Light rotation: elbow at the side, turn the forearm out and back with a light band, 8 to 12 slow reps. Easier version: no band.",
       "Shoulder blade control: reach the arms forward and let the shoulder blades travel around the ribs, then reach overhead along a wall. Easier version: reach only as high as is comfortable.",
       "First pattern: the session's first press or pull with a light load, one to three cues only."]),
    stop("A warm-up drill that hurts is not a warm-up: skip it.", WORSENING, TWO_WEEKS, ACTIVE_LOSS),
    H("Cues"),
    P("Give one to three cues per drill, as a direction or a target: \"reach long through your hands\", \"push the band away\". Watch the next rep, and keep a cue only if the movement changes the way you want."),
    C(REFER, f"Correctives never replace referral. Any stop rule means: {STOP_SESSION} {WORSENING} {TWO_WEEKS} Anything in the urgent or emergency tiers: refer at that tier (see \"When to refer out\")."),
    H("Check your understanding"),
    Q("What does UK specialist guidance report about exercise for subacromial shoulder pain?", ["It reduces pain in the short term and improves function; the recommendation is conditional, on low-certainty evidence, and the best approach is uncertain", "One exercise programme is proven best", "Exercise does not help"], 0,
      "The guidance reports that exercise reduces short-term pain and improves function, rates this as a conditional recommendation on low-certainty evidence, and says the most effective approach remains uncertain.", "claim-slot:l5-subacromial-exercise"),
    Q("How did the 2020 review compare progressive and non-progressive exercise for rotator cuff related shoulder pain?", ["It found progressive exercise clearly better than non-progressive", "It compared each with placebo or no treatment, not with each other, and the evidence was low certainty", "It found no difference between them in a head-to-head comparison"], 1,
      "Each approach was compared with placebo or no treatment over more than six weeks to six months; the review did not compare them head to head, and certainty was low.", "claim-slot:l5-progressive-comparisons"),
    C("Talk it through", "A client wants to spend 20 minutes on activation before every session. What do you keep as a short warm-up, and what moves into the main session as real training?"),
  ],
  "media": [], "resources": [],
}
l5_slots = [
  {"slot": "claim-slot:l5-subacromial-exercise", "statement": "For subacromial pain, the British Elbow & Shoulder Society patient care pathway (PICO 6) reports evidence that exercise reduces pain in the short term (8 weeks to 6 months) and improves patient-reported function, grades this 'Conditional Positive (low evidence)', and states that the most effective physiotherapy or exercise approach remains uncertain.", "candidateSources": [BESS25],
   "note": "Current-evidence check: Tena-Portilla 2026 (PMID 42609059) also reports low certainty and no clearly most effective approach for rotator cuff related shoulder pain; consistent, recorded but not cited in the block. BESS PICO 18 calls physiotherapy a possible first-line treatment for chronic subacromial pain; the lesson does not generalise that narrower clinical recommendation."},
  {"slot": "claim-slot:l5-decompression", "statement": "In adult patients with subacromial pain syndrome lasting more than 3 months, a systematic review with meta-analysis found high-certainty evidence of no additional benefit of subacromial decompression surgery over placebo surgery for pain at 1 year or physical function at 1 to 2 years.", "candidateSources": [LAHDEOJA],
   "note": "Replaces the CSAW trial (Beard 2018), an RCT the claim pipeline does not admit; the meta-analysis pools the placebo-controlled trials, CSAW among them."},
  {"slot": "claim-slot:l5-progressive-comparisons", "statement": "A 2020 systematic review found uncertain clinical benefit for progressive and resisted exercise and no significant benefit for non-progressive or non-resisted exercise, each versus placebo or no treatment at more than 6 weeks to 6 months, in rotator cuff related shoulder pain; evidence was low certainty and the categories were not compared directly.", "candidateSources": [NAUNTON]},
]
l5_scen = [{"prompt": "A client wants 20 minutes of activation before every session.", "goodAnswer": "Keep a short warm-up; move strengthening into the main session with progressive load; make no claim that activation fixes anything.", "safety": "SAFETY.md section 1"}]
notes5 = ["The EMG section and its quiz were removed: the accessible abstract did not support the ratios or the inference limit.",
          "The outline no longer says 'first-line'. The lesson does not generalise BESS PICO 18's narrower recommendation (physiotherapy as a possible first-line treatment for chronic subacromial pain).",
          "The warm-up is practice-based and ranks nothing.",
          "BESS 2025 is expected to become admissible as guidance through W1's D-12 operator-asserted source kind (pending: no receipt yet); its claim statements carry no publication year until the review packet includes one."]

# ---------------------------------------------------------------- lesson 6

l6 = {
  "id": "shoulder-06-loading", "slug": "loading-the-shoulder", "title": "Loading the shoulder: pressing, pulling, overhead, progressions",
  "summary": "Shoulders get stronger with progressive load through a range the client controls. Choose variations, progress one thing at a time, and know the signs that mean do not progress.",
  "durationMinutes": 15, "format": "article",
  "objectives": [
    "Choose pressing, pulling and overhead variations by range, control and goal.",
    "Progress load, range or difficulty one at a time.",
    "Use and define cues for the press, the row and the overhead press.",
    "Recognise the signs that mean do not progress, at every step."],
  "anatomyIds": ["UBERON:0001467", "UBERON:0001470", "UBERON:0006849"],
  "blocks": [
    P("This lesson is for healthy adults whose shoulders tolerate training. Every progression below has its own stop rule beside it; read it before you use the progression."),
    H("Why progression matters"),
    S("For healthy adults, the American College of Sports Medicine position stand on resistance training recommends progressive resistance training to keep improving muscle strength, size and physical performance.", "claim-slot:l6-progression"),
    C(POLICY, BOUNDARY),
    H("Before any progression"),
    C(REFER, f"Check first: no pain at the current level, full control of the range, and no warning sign since the last session. If pain comes on or rises with load: {STOP_SESSION} {WORSENING} {TWO_WEEKS} Anything in the urgent or emergency tiers: refer at that tier."),
    D("press-pull-overhead",
      "Three rows of schematic figures, each a progression from left to right: push-ups from a high box to the floor; a chest-supported row, a bent-over row and a heavier bent-over row; a landmine press, a half-kneeling one-arm press and a standing press.",
      "One progression per row, left to right. Change one thing at a time. Schematic, not to scale.",
      [("pressing", "Pressing.", "Push-up from a raised surface, then a lower surface, then the floor."),
       ("pulling", "Pulling.", "Chest-supported row, then an unsupported row, then a heavier load."),
       ("overhead", "Overhead.", "Landmine press, then half-kneeling single-arm press, then standing press.")]),
    H("Pressing"),
    P("Push-ups, presses with dumbbells or a bar, and the landmine press are all options. Choose by the range the client controls without pain and by their goal. Define a cue before you use it: \"push the floor away\" asks the client to keep pushing at the top of a push-up; \"bend the bar\" asks for tension through the upper back before the press."),
    L(["Progression: push-up from a raised surface, then a lower surface, then the floor.",
       "Progression: dumbbell press through a shorter range first (stopping before the bottom), then the full range the client controls.",
       "Progression: add load only after the current range is controlled for all reps."]),
    stop("Pain at the bottom of a press means stop for the session, not push through. In a later session, only if no warning sign remains, try a shorter range or another variation.", WORSENING, TWO_WEEKS),
    H("Pulling"),
    P("Rows and pulldowns are the pulling options. Coach the shoulder blades to move with the arm rather than holding them locked, and keep pulling work in the programme alongside pressing."),
    L(["Progression: supported row (chest on a bench), then an unsupported row, then heavier load.",
       "Progression: band pulldown, then a cable or machine pulldown, then a pull-up with assistance."]),
    stop(TINGLE, WORSENING, TWO_WEEKS),
    H("Overhead"),
    S("Reaching overhead involves the shoulder blade rotating upward as the arm rises.", "claim-slot:l6-overhead-upward"),
    P("Pick an overhead variation the client can reach and control without pain. One coach-selected order is landmine press, then half-kneeling single-arm press, then standing press. Treat it as an example, not a rule."),
    L(["Progression: landmine press, then half-kneeling single-arm press, then standing press.",
       "Do not progress to a vertical press until the client reaches overhead without pain and without arching the lower back to get there."]),
    stop(ACTIVE_LOSS, TRAUMA, WORSENING),
    H("Building muscle"),
    S("A meta-regression found that muscle growth increases as weekly training volume rises, with diminishing returns: each extra set adds less than the one before.", "claim-slot:l6-volume"),
    S("A meta-analysis did not find an extra muscle-growth benefit from taking sets all the way to momentary muscular failure compared with stopping short of it. That does not show the two are equivalent: a later exploratory analysis suggests muscle growth increases as sets end closer to failure.", "claim-slot:l6-failure"),
    P("For shoulders, add weekly sets gradually, keep a few reps in reserve on most sets, and increase volume only when the client recovers well between sessions and shows no warning sign."),
    stop("If pain comes on as volume rises, stop shoulder loading for the session and apply the referral rules first.", WORSENING, TWO_WEEKS, "Only in a later session, with no warning sign remaining, return to a lower volume."),
    H("Progress one thing at a time"),
    P("Change range, then load, then difficulty, one at a time, and re-check the client's control at each step in a later session. If two things change and pain appears, you will not know which caused it."),
    stop("Severe pain in both shoulders, or new pain, swelling or stiffness in several joints at once: urgent, today.", WORSENING),
    H("Check your understanding"),
    Q("What does the ACSM position stand recommend to keep improving strength and muscle size in healthy adults?", ["Repeating the same load indefinitely", "Progressive resistance training", "Training to failure on every set"], 1,
      "The position stand recommends progressive resistance training for healthy adults.", "claim-slot:l6-progression"),
    Q("Which shoulder blade movement is part of reaching fully overhead?", ["Upward rotation", "Downward rotation", "None: the shoulder blade stays still"], 0,
      "Reaching fully overhead involves upward rotation of the shoulder blade.", "claim-slot:l6-overhead-upward"),
    Q("What did a meta-regression find about weekly training volume and muscle growth?", ["Growth increases with volume, with diminishing returns", "Volume made no difference", "Growth rises by the same amount with every extra set"], 0,
      "Growth increases as volume rises, but each extra set adds less: diminishing returns.", "claim-slot:l6-volume"),
    Q("What did a meta-analysis find about training to momentary failure for muscle growth?", ["No extra benefit from reaching failure, which does not show the two are equivalent", "Failure training always gives more growth", "Failure training prevents growth"], 0,
      "The review found no extra hypertrophy benefit from reaching failure; that does not show equivalence, and later work suggests growth increases closer to failure.", "claim-slot:l6-failure"),
    C("Talk it through", "During a deep dumbbell bench press, a client's shoulder starts to ache at the bottom of the set; push-ups earlier felt fine. What do you do now, and what might change in a later session?"),
  ],
  "media": [], "resources": [],
}
l6_slots = [
  {"slot": "claim-slot:l6-progression", "statement": "The American College of Sports Medicine position stand on resistance training prescription recommends that healthy adults perform progressive resistance training to improve muscle function, size and physical performance.", "candidateSources": [ACSM26],
   "note": "Healthy adults only. ACSM is expected to become admissible as a position stand through W1's D-12 operator-asserted source kind (pending: no receipt yet); no publication year in the statement until the review packet includes one."},
  {"slot": "claim-slot:l6-overhead-upward", "statement": "In asymptomatic individuals, the scapula rotates upward during arm elevation.", "candidateSources": [FERNANDEZ], "note": "Same source as l2-scapular-motions."},
  {"slot": "claim-slot:l6-volume", "statement": "A meta-regression found that muscle hypertrophy increases with weekly resistance training volume, with diminishing returns.", "candidateSources": [PELLAND],
   "note": "Dry-run fix: the ACSM clause and the years are dropped (Sol round 3)."},
  {"slot": "claim-slot:l6-failure", "statement": "A meta-analysis found no hypertrophy advantage for training to momentary muscular failure over non-failure training; this does not establish equivalence, and an exploratory meta-regression found hypertrophy increased as sets were terminated closer to failure.", "candidateSources": [REFALO, ROBINSON],
   "note": "Dry-run fix: neutral population and no publication years. Distinguish reaching failure from proximity to failure."},
]
l6_scen = [{"prompt": "Ache at the bottom of a deep dumbbell bench press during the set; push-ups fine.", "goodAnswer": "Now: stop shoulder loading for the session. In a later session, only if no warning sign remains: a shorter range or another variation, and stop again if pain comes on. Pain getting worse: routine referral now; not improved after 2 weeks: routine referral.", "safety": "SAFETY.md sections 3 and 4"}]
notes6 = ["Every progression has a stop block beside it.", "Progression orders and cue definitions are coach-selected examples; no biomechanical comparison is asserted."]

# ---------------------------------------------------------------- lesson 7

l7 = {
  "id": "shoulder-07-throwing", "slug": "throwing-and-rotation", "title": "Throwing and rotation",
  "summary": "Throwing puts the shoulder through fast, large rotations. Support throwers with strength and sensible workload, record range the same way over time, and know the warning signs.",
  "durationMinutes": 12, "format": "article",
  "objectives": [
    "Describe the range differences professional pitchers' throwing shoulders typically show.",
    "Explain why shoulder range is not a reliable injury screen on its own.",
    "Know the warning signs in throwers, and refer young throwers with shoulder pain urgently."],
  "anatomyIds": ["UBERON:0001467", "UBERON:0001470", "UBERON:0000976"],
  "blocks": [
    P("This lesson gives a strength coach's view of the throwing shoulder. Throwing workload and return-to-throwing decisions belong to the athlete's sport coach and clinician."),
    H("How pitchers' shoulders adapt"),
    S("In professional baseball pitchers, the throwing shoulder typically has less internal rotation and more external rotation than the other shoulder. Across the pitchers studied, the twist of the upper arm bone (humeral retroversion) also differed between the two arms, by about 15 degrees on average.", "claim-slot:l7-adaptation"),
    H("Range and injury risk: still uncertain"),
    S("Whether shoulder range is linked to injury is uncertain and differs by sport. A 2018 meta-analysis found no statistically significant pooled association between the range measures it examined and shoulder or elbow injury in overhead athletes. A 2020 meta-analysis of prospective studies linked too little extra external rotation in the throwing arm to injury in professional pitchers, from three pooled studies, with a caution about the small number of studies, and suggested range screening may not identify risk in some other overhead sports. A 2025 review listed range among several risk factors, alongside reduced strength, previous pain or injury and training load, and noted that studies define injury differently.", "claim-slot:l7-injury-risk"),
    P("So do not set out to make a thrower's two shoulders match, and do not treat one range record as a verdict. Record rotation on both sides the same way over time."),
    H("How to see it"),
    D("rotation-record-position",
      "A schematic figure lying on its back on a bench, seen from the right side. The right upper arm points toward the viewer with a folded towel under the elbow; the forearm points up, with arcs showing it turning toward the head and toward the feet.",
      "The lying rotation record position, right arm. Schematic, not to scale.",
      [("towel", "Towel under the elbow.", "The upper arm is out to the side at shoulder height, and level."),
       ("toward-head", "Toward the head.", "The athlete turns the forearm up toward the head, on their own."),
       ("toward-feet", "Toward the feet.", "Then down toward the feet. You do not push."),
       ("level", "Level with the floor.", "Record where the forearm stops: short of level, level or past level.")]),
    L(["Use one set-up every time: the athlete lies on their back, arm out to the side at shoulder height, elbow bent to a right angle, with a folded towel under the elbow so the upper arm is level.",
       "Ask them to keep the shoulder blade and the back flat on the bench throughout. If either lifts, note it rather than counting that range.",
       "The athlete turns the forearm up toward the head, then down toward the feet, on their own. You do not push.",
       "Write down where the forearm stops in each direction in plain words, compared with the floor: for example \"short of level\", \"level\" or \"past level\". This record is qualitative; it gives no angles or totals.",
       "Record both sides at the same time of day, before training, and look for change across the season. This is a training record, not a test."]),
    stop(TINGLE, ACTIVE_LOSS, TRAUMA, NIGHT, WORSENING, UNDER_18),
    H("What to do"),
    P("Build strength for the rotator cuff and the shoulder blade muscles, rotation strength through the trunk and hips, and controlled deceleration work. Progress one thing at a time, with the same stop rules as lesson 6."),
    stop("Pain while throwing, a loss of velocity with pain, or a \"dead arm\": stop throwing as well as shoulder loading, and refer at the tier that matches.", TINGLE, WORSENING, UNDER_18 + " An urgent GP appointment or NHS 111 the same day, for referral to trauma and orthopaedics."),
    C(POLICY, "Throwing workload, pitch counts and return-to-throwing decisions are for the athlete's sport coach and treating clinician. Your strength work supports that plan; it does not replace it. " + BOUNDARY),
    P("Coaches in other rotational sports, such as racquet sports, swimming and combat sports, can use the same approach: record range the same way over time, build strength, follow the stop rules, and agree workload with the sport coach."),
    H("Check your understanding"),
    Q("What range pattern does a professional pitcher's throwing shoulder typically show?", ["Less internal rotation and more external rotation than the other side", "More internal rotation and less external rotation", "Identical range on both sides"], 0,
      "The throwing shoulder typically shows less internal and more external rotation; the twist of the upper arm bone also differed between the arms on average.", "claim-slot:l7-adaptation"),
    Q("Can shoulder range alone tell you which overhead athletes will be injured?", ["Yes, reliably in every sport", "No: pooled associations were not significant or were limited to some sports, and studies define injury differently", "Only in swimmers"], 1,
      "Syntheses disagree and differ by sport, and injury definitions vary; range is one possible factor among several, not a reliable screen on its own.", "claim-slot:l7-injury-risk"),
    C("Talk it through", "A 15-year-old pitcher says the shoulder hurts after games. What do you do in your session, and who do you tell?"),
  ],
  "media": [], "resources": [],
}
l7_slots = [
  {"slot": "claim-slot:l7-adaptation", "statement": "In professional baseball pitchers, the throwing shoulder shows on average less internal rotation and more external rotation than the non-throwing shoulder; across included pitchers, humeral retroversion differed between the arms by about 15 degrees on average.", "candidateSources": [PAUL],
   "note": "Wording Sol approved in the claim dry run (round 4). It reports the retroversion difference without saying it causes the range difference."},
  {"slot": "claim-slot:l7-injury-risk", "statement": "Evidence linking shoulder range of motion to injury in overhead athletes is uncertain and sport-specific: no statistically significant pooled association for the measures examined (2018 meta-analysis); external rotation insufficiency associated with injury in professional pitchers from three pooled studies, interpreted with caution (2020 meta-analysis of prospective cohorts); range among several risk factors, with inconsistent injury definitions (2025 systematic review).", "candidateSources": [KELLER, POZZI, SALAMH], "note": "Association, not individual prediction."},
]
l7_scen = [{"prompt": "A 15-year-old pitcher says the shoulder hurts after games.", "goodAnswer": "Stop throwing and shoulder loading in the session; urgent: tell the athlete and a parent or carer to get an urgent GP appointment or NHS 111 the same day for referral to trauma and orthopaedics; emergency if any emergency sign.", "safety": "SAFETY.md sections 2 and 4"}]
notes7 = ["The pitching-kinetics section, its objective and its quiz were removed: the only source (Fleisig 1995) is a primary study, which the claim pipeline does not admit, and no qualifying systematic review states those two moments (the 2023 normative meta-analysis by Mine et al. does not).",
          "The rotation record is qualitative (no angles or totals), because a trainer set-up without a defined zero and stabilisation cannot give repeatable numbers.", "The stop blocks use SAFETY.md's tiers: persistent night pain with stiffness is routine; persistent pins and needles is urgent; inability to move after trauma is emergency.",
          "Throwing workload is stated as Spindle policy, not science. The cross-sport paragraph makes no claim about shared mechanics."]

# ---------------------------------------------------------------- lesson 8

l8 = {
  "id": "shoulder-08-refer-out", "slug": "when-to-refer-out", "title": "When to refer out",
  "summary": "Referral is a coaching skill: notice, stop, refer to the right place at the right speed, and keep the client training only what is safe.",
  "durationMinutes": 15, "format": "article",
  "objectives": [
    "Apply the three referral tiers, with the highest matching tier winning.",
    "Use the stop rules and say what to do next.",
    "Know who is outside the base module and how to work alongside a clinician's plan.",
    "Refer in plain, calm, non-diagnostic words, with the right destination and timing."],
  "anatomyIds": ["UBERON:0001467"],
  "blocks": [
    P("Every lesson in this module has put a stop-and-refer box beside its screens and progressions. This lesson puts them all in one place. The lists below come straight from Spindle's shoulder safety rules."),
    H("Your scope"),
    P("A trainer does not diagnose or treat injuries. A trainer notices, stops, and refers. Describe what you see, never name a condition, and never tell a client a screen has cleared them."),
    C(POLICY, BOUNDARY),
    H("Which tier: the highest one that matches"),
    P(f"{HIGHEST} An emergency sign overrides every urgent or routine sign, and an urgent sign overrides every routine sign."),
    H("Emergency: call emergency services now (999 in the UK)"),
    L(TIER["emergency"]),
    C("Note on infection", INFECTION_NOTE),
    H("Urgent: an urgent GP appointment or NHS 111 today (or the local equivalent)"),
    L(TIER["urgent"]),
    H("Routine: a GP or physiotherapist"),
    L(TIER["routine"]),
    H("Stop rules"),
    P("Stop always means no further loading of that shoulder in this session. Changes to range, load or variation belong to a later session, and only if no warning sign remains."),
    L(STOP_ROWS),
    H("Outside the base module"),
    L(EXCL_ROWS),
    H("Keeping routine referrals calm"),
    S("For subacromial shoulder pain, UK specialist guidance from the British Elbow & Shoulder Society describes the condition as usually self-limiting, with most symptoms responding to initial care within about three months.", "claim-slot:l8-subacromial-course"),
    P("That keeps a routine referral calm. It is about one diagnosed condition, and it never delays an urgent or emergency referral."),
    H("Saying it, tier by tier"),
    L(["Emergency: call emergency services yourself, stay with the client, and do not let them drive. After a fall or impact, do not move the arm or try to put it back. Nothing else happens in the session.",
       "Urgent: \"You can't lift your arm yourself today, and that's new. We'll stop the shoulder work now. Please get it checked today: call your GP for an urgent appointment, or NHS 111.\" Do not offer more training in place of getting help.",
       "Routine, with no other warning sign: \"Your shoulder pain is getting worse. Please book in with your GP or a physiotherapist now; you don't need to wait.\" With the shoulder left out, the rest of the session can go ahead if the client feels well.",
       "Every tier: do not name a condition, and do not say it is nothing."]),
    H("Working with a clinician's plan"),
    P("Ask the client to share the plan, ideally in writing. Train within it, ask the clinician before changing it, and do not progress it on your own."),
    H("Check your understanding"),
    Q("For subacromial shoulder pain, what does UK specialist guidance say about how symptoms usually go?", ["Most symptoms respond to initial care within about three months", "Symptoms never improve without surgery", "Most need emergency care"], 0,
      "The guidance describes subacromial pain as usually self-limiting, with most symptoms responding to initial care within about three months.", "claim-slot:l8-subacromial-course"),
    C("Talk it through", "Pick the tier and say what you do first, who to contact and how soon: (1) arm pain with chest tightness during a session; (2) a new lump above the collarbone; (3) shoulder pain that has got worse every day this week, with no other sign; (4) after a fall, the client cannot move the arm; (5) fever and shoulder pain; (6) an ache after training that settled within a day, with no other sign."),
  ],
  "media": [], "resources": [],
}
l8_slots = [
  {"slot": "claim-slot:l8-subacromial-course", "statement": "The British Elbow & Shoulder Society subacromial pain care pathway describes subacromial pain as usually self-limiting, with most symptoms responding within three months, in the context of initial primary-care management.", "candidateSources": [BESS25]},
]
l8_scen = [
  {"prompt": "Arm pain with chest tightness during a session.", "goodAnswer": "Stop all exercise; emergency: call emergency services (999 in the UK) now and stay with the client.", "safety": "SAFETY.md section 4"},
  {"prompt": "A new lump above the collarbone.", "goodAnswer": "Stop shoulder loading; urgent: an urgent GP appointment or NHS 111 today.", "safety": "SAFETY.md section 4"},
  {"prompt": "Shoulder pain that has got worse every day this week; no other sign.", "goodAnswer": "Stop shoulder loading for this session; routine referral now: a GP or physiotherapist, without waiting for 2 weeks.", "safety": "SAFETY.md sections 3 and 4"},
  {"prompt": "After a fall, the client cannot move the arm.", "goodAnswer": "Stop; emergency: call emergency services now; do not move the arm or try to put it back; do not let them drive.", "safety": "SAFETY.md sections 3 and 4"},
  {"prompt": "Fever and shoulder pain.", "goodAnswer": "Stop all exercise; emergency: call emergency services (999 in the UK) or go to the emergency department now. This is Spindle policy, stricter than the NHS page.", "safety": "SAFETY.md section 4 and its note on infection"},
  {"prompt": "An ache after training that settled within a day; no other sign.", "goodAnswer": "Continue; stop shoulder loading if pain comes on during a set.", "safety": "SAFETY.md section 3"},
]
notes8 = ["The tier, stop-rule and exclusion checklists are parsed from docs/curriculum/SAFETY.md (bounded at the next heading; malformed tables stop the build); regenerate whenever SAFETY.md changes.",
          "Scenario answers give the first action, the tier, who to contact and how soon. Scenarios stay ungraded."]

# ---------------------------------------------------------------- render, check, write

LESSONS = [
    (1, "01-shoulder-anatomy.json", l1, l1_slots, l1_scen, notes1),
    (2, "02-scapulohumeral-rhythm.json", l2, l2_slots, l2_scen, notes2),
    (3, "03-mobility-and-stability.json", l3, l3_slots, l3_scen, notes3),
    (4, "04-screens-and-red-flags.json", l4, l4_slots, l4_scen, notes4),
    (5, "05-correctives-and-activation.json", l5, l5_slots, l5_scen, notes5),
    (6, "06-loading-the-shoulder.json", l6, l6_slots, l6_scen, notes6),
    (7, "07-throwing-and-rotation.json", l7, l7_slots, l7_scen, notes7),
    (8, "08-when-to-refer-out.json", l8, l8_slots, l8_scen, notes8),
]

# ---------------------------------------------------------------- claim metadata
# evidenceLevel and population for every claim slot, as the claim RPC requires (claim.evidenceLevel,
# 1-100 characters; claim.population, 1-500). The level names the study designs behind the claim;
# the population quotes each source's own wording (abstract or full text), never an inference.
# Anatomy and biomechanics claims describe the human shoulder, not a sampled population, and say so.

ANATOMY = "Human shoulder anatomy; not a sampled study population"
FERNANDEZ_POP = '"asymptomatic individuals" (Fernández-Matías 2025, which reviewed "healthy individuals and those with RCRSP")'
ACSM_POP = '"healthy adults (≥18 yr)" (ACSM 2026)'
BESS_POP = '"Subacromial Shoulder Pain" (BESS 2025 patient care pathway)'
CLAIM_META = {
    "claim-slot:l1-bones-joints": ("Narrative review (anatomy)", ANATOMY + " (Frank 2013)."),
    "claim-slot:l1-scapulothoracic": ("Narrative review (anatomy)", ANATOMY + ": \"the scapulothoracic articulation\" (Frank 2013)."),
    "claim-slot:l1-shallow-socket": ("Narrative review (anatomy); anatomic specimen study", ANATOMY + "; \"25 anatomic specimen shoulders\" (Howell 1989)."),
    "claim-slot:l1-cuff": ("Narrative reviews (anatomy)", ANATOMY + " (Cavanaugh 2024; Frank 2013)."),
    "claim-slot:l1-concavity": ("Narrative review of in vitro biomechanical studies", "The glenohumeral joint in \"in vitro studies\" (Lippitt 1993); not a patient population."),
    "claim-slot:l1-movers": ("Clinical examination guide; expert consensus guide; narrative review (anatomy)", ANATOMY + ": muscle actions described for bedside manual muscle testing (Vijian 2023) and in an expert guide to shoulder anatomy (Jacinto 2022)."),
    "claim-slot:l2-scapular-motions": ("Systematic review with multilevel meta-regression", FERNANDEZ_POP + "."),
    "claim-slot:l2-shared-ratio": ("Systematic review with multilevel meta-regression", FERNANDEZ_POP + "."),
    "claim-slot:l2-dyskinesis": ("Consensus statement", "People with shoulder injuries (Kibler 2013, Scapular Summit consensus)."),
    "claim-slot:l3-kyphosis-pain": ("Systematic review; systematic review with meta-analysis of cross-sectional studies", '"groups with and without shoulder pain" (Barrett 2016); "non-athletes with shoulder pain compared to asymptomatic individuals" (Fialho 2024).'),
    "claim-slot:l3-upright-range": ("Systematic review", '"people with and without shoulder pain" (Barrett 2016).'),
    "claim-slot:l4-exam-tests": ("Systematic reviews with meta-analysis (diagnostic accuracy)", '"3,438 patients" examined for "rotator cuff tears (RCTs) and subacromial impingement syndrome (SIS)" (Zhao 2024); shoulder physical examination studies (Hegedus 2012).'),
    "claim-slot:l5-subacromial-exercise": ("Clinical guideline (GRADE), British Elbow & Shoulder Society", BESS_POP + "."),
    "claim-slot:l5-decompression": ("Systematic review with meta-analysis of randomised controlled trials", '"adult patients with subacromial pain syndrome lasting for more than 3 months" (Lähdeoja 2020).'),
    "claim-slot:l5-progressive-comparisons": ("Systematic review with meta-analysis of randomised controlled trials", '"people with rotator cuff related pain" (Naunton 2020).'),
    "claim-slot:l6-progression": ("Position stand (overview of systematic reviews)", ACSM_POP + "."),
    "claim-slot:l6-overhead-upward": ("Systematic review with multilevel meta-regression", FERNANDEZ_POP + "."),
    "claim-slot:l6-volume": ("Meta-regression", "Participants in 35 studies contributing to the hypertrophy volume analysis, n=1,032 (Pelland 2026, section 3.6.1)."),
    "claim-slot:l6-failure": ("Systematic review with meta-analysis; exploratory meta-regression", "Participants in resistance training studies (Refalo 2023; Robinson 2024)."),
    "claim-slot:l7-adaptation": ("Systematic review (level of evidence 4)", 'Professional baseball pitchers: the rotation result pools 13 studies of 1,101 professional pitchers (Paul 2025, whose overall eligibility was "nonrecreational baseball pitchers").'),
    "claim-slot:l7-injury-risk": ("Systematic reviews with meta-analysis; systematic review of prospective studies", '"overhead athletes" (Keller 2018); "overhead athletes from Olympic or college sports", with pooled data from "professional baseball pitchers" (Pozzi 2020); "the athletic population" (Salamh 2025).'),
    "claim-slot:l8-subacromial-course": ("Clinical guideline (GRADE), British Elbow & Shoulder Society", BESS_POP + "."),
}

def with_meta(slot):
    """The slot with its claim metadata, in a stable key order."""
    level, population = CLAIM_META[slot["slot"]]
    out = {"slot": slot["slot"], "statement": slot["statement"], "evidenceLevel": level, "population": population}
    out.update({k: v for k, v in slot.items() if k not in out})
    return out

def check(number, lesson, slots, scenarios):
    """Structural rules the drafts must meet before anything is written."""
    errors = []
    defined = [s["slot"] for s in slots]
    if len(set(defined)) != len(defined):
        errors.append("duplicate claim slots")
    used = set()
    for i, block in enumerate(lesson["blocks"]):
        support, claims = block.get("support"), block.get("claimIds", [])
        if support == "science":
            if not claims:
                errors.append(f"block {i}: science without a claim slot")
            used.update(claims)
        elif claims:
            errors.append(f"block {i}: practice-based block binds claims")
        if block["kind"] == "quiz":
            q = block["content"]
            if support != "science":
                errors.append(f"block {i}: graded quiz must be science")
            if not 0 <= q["answerIndex"] < len(q["options"]) or len(set(q["options"])) != len(q["options"]):
                errors.append(f"block {i}: bad options or answer index")
    if used != set(defined):
        errors.append(f"slots used {sorted(used)} differ from slots defined {sorted(defined)}")
    for s in slots:
        if not 1 <= len(s.get("evidenceLevel", "")) <= 100:
            errors.append(f"{s['slot']}: evidenceLevel must be 1-100 characters")
        if not 1 <= len(s.get("population", "")) <= 500:
            errors.append(f"{s['slot']}: population must be 1-500 characters")
        if not s["candidateSources"]:
            errors.append(f"{s['slot']}: no candidate source")
        for c in s["candidateSources"]:
            if not c.get("rights"):
                errors.append(f"{s['slot']}: a source has no rights record")
            if not (c.get("doi") or c.get("pmid") or c.get("url")):
                errors.append(f"{s['slot']}: a source has no identifier")
    for sc in scenarios:
        if not sc["goodAnswer"].strip():
            errors.append("empty scenario answer")
    if errors:
        raise SystemExit(f"lesson {number}: " + "; ".join(errors))

def render():
    files = {}
    unknown = set(CLAIM_META) - {s["slot"] for *_, slots, _, _ in LESSONS for s in slots}
    if unknown:
        raise SystemExit(f"claim metadata for unknown slots: {sorted(unknown)}")
    for number, name, lesson, slots, scenarios, notes in LESSONS:
        slots = [with_meta(s) for s in slots]
        check(number, lesson, slots, scenarios)
        draft = {"draft": True, "status": "provisional: written before the outline review; not publishable (claim slots are not approved claims)",
                 "module": "shoulder", "lessonNumber": number, "originality": ORIGINALITY, "reviewNotes": notes,
                 "claimSlots": slots, "scenarios": scenarios, "lesson": lesson}
        files[name] = json.dumps(draft, indent=2, ensure_ascii=False) + "\n"
    return files

def write_atomically(files):
    """Writes every draft or none.

    1. Every new content goes to a temporary file, and every existing draft is copied to a
       backup file, before any draft is touched.
    2. Each draft is swapped in with os.replace (atomic on one filesystem).
    3. If any step fails, every draft already swapped is restored by os.replace from its
       backup (or removed, if it did not exist before). Every restoration is attempted even
       when another one fails. A backup whose restoration failed is kept, and a recovery
       message names it, so no previous content is lost.
    Temporary files and backups that are no longer needed are removed."""
    staged = {}   # name -> temporary file with the new content
    backups = {}  # name -> backup of the previous content (absent: the draft is new)
    replaced = []
    try:
        for name, text in files.items():
            fd, tmp = tempfile.mkstemp(dir=OUT, prefix=f".{name}.", suffix=".tmp")
            staged[name] = tmp
            with os.fdopen(fd, "w") as f:
                f.write(text)
            if (OUT / name).exists():
                fd, bak = tempfile.mkstemp(dir=OUT, prefix=f".{name}.", suffix=".bak")
                backups[name] = bak
                with os.fdopen(fd, "wb") as f:
                    f.write((OUT / name).read_bytes())
        for name in files:
            os.replace(staged[name], OUT / name)
            del staged[name]
            replaced.append(name)
    except BaseException:
        failed = restore(replaced, backups)
        if failed:
            print("build_drafts: the write failed and some drafts could not be restored. Recover them by hand:", file=sys.stderr)
            for name, bak in failed:
                print(f"  {bak} -> {OUT / name}" if bak else f"  remove {OUT / name} (it is new)", file=sys.stderr)
        raise
    finally:
        for tmp in staged.values():
            pathlib.Path(tmp).unlink(missing_ok=True)
        for bak in backups.values():
            pathlib.Path(bak).unlink(missing_ok=True)

def restore(replaced, backups):
    """Restores every swapped draft; returns the ones that failed. A backup that was used is
    removed from `backups`; one whose restoration failed is removed too, so the caller's
    cleanup keeps it on disk for recovery."""
    failed = []
    for name in replaced:
        bak = backups.pop(name, None)
        try:
            if bak is None:
                (OUT / name).unlink(missing_ok=True)
            else:
                os.replace(bak, OUT / name)
        except OSError:
            failed.append((name, bak))
    return failed

if __name__ == "__main__":
    files = render()
    write_atomically(files)
    print(f"wrote {len(files)} drafts")
