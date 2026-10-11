"""Builds the provisional shoulder lesson drafts in this folder.

Usage (from the repo root): python3 content/shoulder/drafts/build_drafts.py content/shoulder/drafts

Lesson 8 parses its tier, stop-rule and exclusion lists from docs/curriculum/SAFETY.md, so run
this again whenever SAFETY.md changes. Drafts are not publishable: science blocks bind claim-slot ids.
"""
import json, pathlib, sys
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)

def P(text): return {"kind": "paragraph", "content": text, "support": "practice-based", "claimIds": []}
def S(text, *slots): return {"kind": "paragraph", "content": text, "support": "science", "claimIds": list(slots)}
def H(text): return {"kind": "heading", "content": text}
def C(label, text, support="practice-based", slots=()): return {"kind": "callout", "content": {"label": label, "text": text}, "support": support, "claimIds": list(slots)}
def L(items): return {"kind": "checklist", "content": items, "support": "practice-based", "claimIds": []}
def D(did, caption): return {"kind": "diagram", "content": {"diagramId": did, "caption": caption}}
def Q(prompt, options, answer, expl, *slots): return {"kind": "quiz", "content": {"prompt": prompt, "options": options, "answerIndex": answer, "explanation": expl}, "support": "science", "claimIds": list(slots)}

TA2 = {"kind": "nomenclature", "citation": "FIPAT. Terminologia Anatomica, 2nd edition (TA2). TA2 viewer, Open Anatomy.", "url": "https://ta2viewer.openanatomy.org/"}
HOWELL = {"kind": "paper", "citation": "Howell SM, Galinat BJ. The glenoid-labral socket. A constrained articular surface. Clin Orthop Relat Res. 1989;(243):122-125.", "pmid": "2721051"}
LIPPITT = {"kind": "paper", "citation": "Lippitt S, Matsen F. Mechanisms of glenohumeral joint stability. Clin Orthop Relat Res. 1993;(291):20-28.", "pmid": "8504601"}
REINOLD = {"kind": "paper", "citation": "Reinold MM, Escamilla RF, Wilk KE. Current concepts in the scientific and clinical rationale behind exercises for glenohumeral and scapulothoracic musculature. J Orthop Sports Phys Ther. 2009;39(2):105-117.", "doi": "10.2519/jospt.2009.2835", "pmid": "19194023"}
LUDEWIG = {"kind": "paper", "citation": "Ludewig PM, Reynolds JF. The association of scapular kinematics and glenohumeral joint pathologies. J Orthop Sports Phys Ther. 2009;39(2):90-104.", "doi": "10.2519/jospt.2009.2808", "pmid": "19194022"}
MCCLURE = {"kind": "paper", "citation": "McClure PW, Michener LA, Sennett BJ, Karduna AR. Direct 3-dimensional measurement of scapular kinematics during dynamic movements in vivo. J Shoulder Elbow Surg. 2001;10(3):269-277.", "doi": "10.1067/mse.2001.112954", "pmid": "11408911"}
INMAN = {"kind": "paper", "citation": "Inman VT, Saunders JB, Abbott LC. Observations of the function of the shoulder joint. 1944. Reprinted in Clin Orthop Relat Res. 1996;(330):3-12.", "doi": "10.1097/00003086-199609000-00002", "pmid": "8804269"}
MCQUADE = {"kind": "paper", "citation": "McQuade KJ, Smidt GL. Dynamic scapulohumeral rhythm: the effects of external resistance during elevation of the arm in the scapular plane. J Orthop Sports Phys Ther. 1998;27(2):125-133.", "doi": "10.2519/jospt.1998.27.2.125", "pmid": "9475136"}
BAGG = {"kind": "paper", "citation": "Bagg SD, Forrest WJ. A biomechanical analysis of scapular rotation during arm abduction in the scapular plane. Am J Phys Med Rehabil. 1988;67(6):238-245.", "pmid": "3196449"}
KIBLER = {"kind": "consensus", "citation": "Kibler WB, Ludewig PM, McClure PW, et al. Clinical implications of scapular dyskinesis in shoulder injury: the 2013 consensus statement from the 'Scapular Summit'. Br J Sports Med. 2013;47(14):877-885.", "doi": "10.1136/bjsports-2013-092425", "pmid": "23580420"}
PLUMMER = {"kind": "paper", "citation": "Plummer HA, Sum JC, Pozzi F, Varghese R, Michener LA. Observational scapular dyskinesis: known-groups validity in patients with and without shoulder pain. J Orthop Sports Phys Ther. 2017;47(8):530-537.", "doi": "10.2519/jospt.2017.7268", "pmid": "28683230"}

REFER = "Stop and refer"
ORIGINALITY = ("Original Spindle text, CC BY-SA 4.0. AI-drafted (Claude Opus 5.5, 2026-10-11) in our own words from general anatomy knowledge; "
  "the candidate sources were used only to choose which facts need a claim, and no sentence, figure, table, exercise sequence or analogy was copied from them or from any coach. "
  "The style follows docs/curriculum/STYLE.md. To be model-reviewed (D-08) with an originality check and a private provenance record before publishing.")

def draft(number, lesson, slots, scenarios, notes):
    return {"draft": True, "status": "provisional: written before the outline review; not publishable (claim slots are not approved claims)",
            "module": "shoulder", "lessonNumber": number,
            "originality": ORIGINALITY, "reviewNotes": notes,
            "claimSlots": slots, "scenarios": scenarios, "lesson": lesson}

l1 = {
  "id": "shoulder-01-anatomy", "slug": "shoulder-anatomy", "title": "Shoulder anatomy a trainer needs",
  "summary": "A working map of the shoulder: three bones, four joints, the cuff that keeps the ball centred, and the big muscles that move the arm.",
  "durationMinutes": 12, "format": "article",
  "objectives": [
    "Name the bones and joints of the shoulder in plain words and in standard terms.",
    "Explain why the ball-and-socket joint trades stability for range.",
    "Describe what the rotator cuff does as a group.",
    "Find the main landmarks on yourself and, with permission, on a client."],
  "anatomyIds": ["UBERON:0001467", "UBERON:0001470", "UBERON:0003692", "UBERON:0001469", "UBERON:0006849", "UBERON:0000976", "UBERON:0011959", "UBERON:0003683"],
  "blocks": [
    P("This lesson gives you a working map of the shoulder: where the bones meet, what keeps the ball in its socket, and which muscles do the moving. Every later lesson in this module uses this map."),
    H("Three bones, four places they meet"),
    S("Three bones make the shoulder: the upper arm bone (humerus), the shoulder blade (scapula) and the collarbone (clavicle). They meet at three joints. The ball-and-socket joint (glenohumeral joint) joins the arm to the shoulder blade. The acromioclavicular joint joins the collarbone to the top of the shoulder blade. The sternoclavicular joint joins the collarbone to the breastbone, and it is the only bony link between the arm and the rest of the skeleton.", "claim-slot:l1-bones-joints"),
    S("The shoulder blade also slides over the back of the ribcage. Coaches often call this the scapulothoracic joint, but it is not a joint in the usual sense: there is no joint capsule, only muscle and soft tissue between the shoulder blade and the ribs.", "claim-slot:l1-scapulothoracic"),
    D("shoulder-joints-front-back", "The three bones and the four places they meet, seen from the front and from behind."),
    H("A shallow socket"),
    S("The socket on the shoulder blade (the glenoid) is shallow and small compared with the ball at the top of the humerus. A rim of fibrous cartilage, the labrum, deepens the socket, and a joint capsule with its ligaments surrounds the joint.", "claim-slot:l1-shallow-socket"),
    P("A picture that works for clients: the ball sits on a saucer, not in a cup. The saucer lets the arm move a long way in almost every direction. The cost is that something has to keep the ball on the saucer."),
    H("The rotator cuff"),
    S("Four muscles form the rotator cuff: supraspinatus, infraspinatus, teres minor and subscapularis. Each one starts on the shoulder blade and attaches close to the joint at the top of the humerus.", "claim-slot:l1-cuff-muscles"),
    S("Working together, the cuff muscles press the ball into the socket and help keep it centred while larger muscles move the arm. Researchers call this pressing effect concavity compression.", "claim-slot:l1-cuff-centring"),
    C("Coach note", "Think of the cuff as a team. You will hear people blame one cuff muscle for every shoulder complaint. This lesson keeps it simple: the cuff's shared job is to keep the ball centred."),
    H("The big movers"),
    S("Larger muscles produce most of the arm's force. The deltoid raises the arm. The pectoralis major and latissimus dorsi pull the arm toward and across the body. The trapezius and serratus anterior move and steady the shoulder blade, so the socket follows the ball.", "claim-slot:l1-big-movers"),
    D("shoulder-cuff-and-movers", "The rotator cuff close to the joint, and the larger muscles that move the arm and the shoulder blade."),
    H("Why it matters"),
    P("Big range plus a shallow socket means control matters as much as mobility. On the gym floor your job is to load the range a client can control, and to build both the muscles that move the arm and the muscles that steady it."),
    H("How to see it"),
    P("Find the landmarks on yourself first. With a client, ask before you touch, say what you are touching, and offer to let them find it themselves."),
    L(["Follow the collarbone out from the base of the neck to the bony point at the top of the shoulder (acromion).",
       "Find the ridge that runs across the back of the shoulder blade (spine of the scapula).",
       "Find the bottom tip of the shoulder blade (inferior angle). Keep a finger near it while the arm rises, and feel it move.",
       "Find the front of the shoulder below the collarbone, where the ball sits in front of the socket."]),
    H("What to do"),
    P("Use plain names with clients and standard names with clinicians. \"The ball-and-socket joint\" and \"the glenohumeral joint\" are the same thing. Saying both helps when a client brings you notes from a physiotherapist or doctor."),
    C(REFER, "This lesson tells you where things are and what they do. It does not tell you what is wrong. If a client points to a painful spot, describe where it is and how it behaves; never name an injury. Stop shoulder work for the session and refer when a warning sign appears. After a fall or impact, an arm the client cannot move or a shoulder that looks out of place: emergency services now. Other new pain after an injury, pins and needles that do not go away, or a new inability to lift the arm themselves: an urgent GP appointment or NHS 111 today. See \"When to refer out\"."),
    H("Check your understanding"),
    Q("Which joint joins the upper arm bone to the shoulder blade?", ["Acromioclavicular joint", "Glenohumeral joint", "Sternoclavicular joint", "Scapulothoracic joint"], 1,
      "The glenohumeral joint is the ball-and-socket joint between the humerus and the glenoid of the shoulder blade.", "claim-slot:l1-bones-joints"),
    Q("What deepens the shallow socket of the shoulder?", ["The labrum", "The acromion", "The collarbone", "The deltoid"], 0,
      "The labrum is a rim of fibrous cartilage around the glenoid that makes the socket deeper.", "claim-slot:l1-shallow-socket"),
    Q("As a group, what does the rotator cuff do while the arm moves?", ["It produces most of the force for heavy overhead lifts", "It presses the ball into the socket and helps keep it centred", "It locks the shoulder blade so it cannot move"], 1,
      "The cuff's shared job is to compress the ball into the socket and keep it centred while larger muscles move the arm.", "claim-slot:l1-cuff-centring"),
    C("Talk it through", "A client points to the front of the shoulder and asks: \"Is that my rotator cuff?\" What do you say? A good answer describes the area in plain words, says that you do not diagnose, and asks how it behaves in training. If it hurts, or if any warning sign is present, stop and refer."),
  ],
  "media": [], "resources": [],
}

l1_slots = [
  {"slot": "claim-slot:l1-bones-joints", "statement": "The shoulder complex comprises the humerus, scapula and clavicle, articulating at the glenohumeral, acromioclavicular and sternoclavicular joints; the sternoclavicular joint is the only bony articulation between the upper limb and the axial skeleton.", "candidateSources": [TA2, LUDEWIG], "note": "Nomenclature from TA2; the 'only bony link' clause needs an open anatomy source in the packet or it is removed."},
  {"slot": "claim-slot:l1-scapulothoracic", "statement": "The scapulothoracic articulation is a functional gliding interface between the scapula and the thorax, not a synovial joint with a capsule.", "candidateSources": [TA2, LUDEWIG], "note": "If no open source states this directly, the second sentence is removed. It is never kept under a practice-based label."},
  {"slot": "claim-slot:l1-shallow-socket", "statement": "The glenoid fossa is shallow relative to the humeral head; the glenoid labrum deepens the socket, and the capsule and glenohumeral ligaments surround the joint.", "candidateSources": [HOWELL, LIPPITT]},
  {"slot": "claim-slot:l1-cuff-muscles", "statement": "The rotator cuff consists of supraspinatus, infraspinatus, teres minor and subscapularis, which arise from the scapula and insert near the glenohumeral joint on the proximal humerus.", "candidateSources": [TA2, REINOLD]},
  {"slot": "claim-slot:l1-cuff-centring", "statement": "Rotator cuff contraction compresses the humeral head into the glenoid (concavity compression), contributing to glenohumeral stability during arm movement.", "candidateSources": [LIPPITT, REINOLD]},
  {"slot": "claim-slot:l1-big-movers", "statement": "The deltoid elevates the arm; pectoralis major and latissimus dorsi adduct and internally rotate it; trapezius and serratus anterior move and stabilise the scapula.", "candidateSources": [REINOLD, TA2], "note": "Check that the packet covers each muscle's action; split into separate claims if the reviewer prefers."},
]
l1_scen = [{"prompt": "A client points to the front of the shoulder and asks: \"Is that my rotator cuff?\"", "goodAnswer": "Describe the area; say you do not diagnose; ask how it behaves; follow the stop-and-refer rules if it hurts.", "safety": "SAFETY.md sections 1 and 3"}]

l2 = {
  "id": "shoulder-02-rhythm", "slug": "scapulohumeral-rhythm", "title": "Scapulohumeral rhythm",
  "summary": "When the arm goes up, the shoulder blade moves with it. Learn what that shared movement looks like and how to watch it.",
  "durationMinutes": 12, "format": "article",
  "objectives": [
    "Describe the shoulder blade movements that happen consistently when the arm is raised, and the one that varies.",
    "Explain that raising the arm is shared between the ball-and-socket joint and the shoulder blade, and that the share varies.",
    "Name the muscles that rotate the shoulder blade upward.",
    "Watch a client raise their arms and describe what you see in plain words."],
  "anatomyIds": ["UBERON:0001467", "UBERON:0001470", "UBERON:0006849"],
  "blocks": [
    P("Raise your arm overhead and the shoulder blade comes along. Watching that shared movement is one of the most useful things a trainer can learn to do, as long as you remember what it can and cannot tell you."),
    H("The shoulder blade moves too"),
    S("When the arm is raised, the shoulder blade does not stay still. It rotates upward, so the socket turns to face more toward the ceiling, and it tilts backward at the top. How much it also turns around the ribcage, inward or outward, depends on the direction the arm is raised and how high it goes.", "claim-slot:l2-scapular-motions"),
    D("scapula-upward-rotation", "The shoulder blade at three arm positions: by the side, level with the shoulder, and overhead."),
    H("A shared movement"),
    S("Raising the arm is shared between the ball-and-socket joint and the shoulder blade. Over the whole movement the ball-and-socket joint often contributes about twice as much as the shoulder blade, but that ratio is not fixed: it differs between people, changes through the range, and changes with load.", "claim-slot:l2-shared-ratio"),
    P("Do not count degrees on the gym floor. The useful idea is the sharing, not the number."),
    H("The muscles that turn the shoulder blade"),
    S("Upward rotation of the shoulder blade comes from muscles pulling in different directions at the same time: the upper and lower parts of the trapezius together with the serratus anterior. A pair or group of muscles working like this is called a force couple.", "claim-slot:l2-force-couple"),
    H("Different does not mean injured"),
    S("Visible differences in how the shoulder blade moves, often called scapular dyskinesis, are common in people who have no shoulder pain. On their own they do not show that someone is injured or will be.", "claim-slot:l2-dyskinesis"),
    H("How to see it"),
    L(["Stand behind the client. Ask first; a fitted top lets you see the shoulder blades without asking anyone to undress.",
       "Ask them to raise both arms slowly forward and up, then lower them, 3 to 5 times.",
       "Watch both shoulder blades: do they start moving at a similar time and travel a similar amount?",
       "On the way down, watch the inner edge and the bottom tip of each shoulder blade. Do they stay close to the ribs or lift away?",
       "If differences are hard to see, a light dumbbell in each hand can make them clearer.",
       "Write down what you saw in plain words, for example: \"left shoulder blade lifts away from the ribs on the way down.\""]),
    C(REFER, "Stop the drill, and stop shoulder loading for the rest of the session, if pain comes on or rises during the raise. If that pain is getting worse over the following days, refer to a GP or physiotherapist now; if it has not improved after 2 weeks, refer then. Pins and needles that do not go away, or a new inability to lift the arm themselves: an urgent GP appointment or NHS 111 today. After a fall or impact, an arm they cannot move: emergency services now. What you saw is a note for training, not a finding: this check never clears anyone and never names an injury."),
    H("What to do: cues for overhead work"),
    P("\"Shoulder blades back and down\" is a common cue, and it helps some lifters set up for a bench press. Overhead, the same cue can fight the upward rotation you learned above. For overhead reaching, try \"reach long through your hands\" or \"let your shoulder blades travel with your arms\"."),
    P("Give one cue, watch the next rep, and keep the cue only if the movement changes the way you want. If it does not, drop it and try a different position or a lighter load."),
    H("Check your understanding"),
    Q("Which two shoulder blade movements happen consistently as the arm is raised overhead?", ["Upward rotation and backward tilt", "Downward rotation and forward tilt", "None: the shoulder blade stays still"], 0,
      "As the arm rises, the shoulder blade rotates upward and tilts backward. Its turning around the ribcage varies with the direction and height of the raise.", "claim-slot:l2-scapular-motions"),
    Q("How is raising the arm shared between the ball-and-socket joint and the shoulder blade?", ["A fixed 2:1 in everyone", "The share varies between people, through the range and with load", "The shoulder blade does most of the work"], 1,
      "About 2:1 is a common average over the whole movement, but the ratio varies between people, through the range and with load.", "claim-slot:l2-shared-ratio"),
    Q("Which muscles work together to rotate the shoulder blade upward?", ["Upper and lower trapezius with serratus anterior", "Biceps and triceps", "Pectoralis major and latissimus dorsi"], 0,
      "Upward rotation comes from a force couple: upper and lower trapezius with serratus anterior.", "claim-slot:l2-force-couple"),
    Q("A client with no shoulder pain shows a shoulder blade that lifts away from the ribs when lowering the arms. What does that tell you on its own?", ["They have a shoulder injury", "Nothing certain: this is common in people without pain", "They must stop all overhead training"], 1,
      "Visible changes in shoulder blade movement are common in people without pain, so on their own they do not show an injury.", "claim-slot:l2-dyskinesis"),
    C("Talk it through", "One shoulder blade lifts a little from the ribs as a client lowers from overhead. They have no pain and no other warning signs. Do you continue, adjust or refer? Now change one thing: the client says the shoulder aches more with each rep. What changes in your answer?"),
  ],
  "media": [], "resources": [],
}
l2_slots = [
  {"slot": "claim-slot:l2-scapular-motions", "statement": "During humeral elevation the scapula upwardly rotates and tilts posteriorly; its internal or external rotation on the thorax varies with the plane of elevation and through the range.", "candidateSources": [LUDEWIG, MCCLURE], "note": "Ludewig and Reynolds 2009 is open in PMC (PMC2730194)."},
  {"slot": "claim-slot:l2-shared-ratio", "statement": "Humeral elevation is shared between glenohumeral and scapulothoracic motion; an overall ratio of about 2:1 is commonly reported, but the ratio varies between individuals, across the range of elevation and with external load.", "candidateSources": [INMAN, MCQUADE], "note": "The block must keep the variation clause. Inman is a 1944 study reprinted in 1996; McQuade and Smidt show the load effect."},
  {"slot": "claim-slot:l2-force-couple", "statement": "Scapular upward rotation is produced by a force couple of the upper and lower trapezius and the serratus anterior.", "candidateSources": [BAGG, REINOLD]},
  {"slot": "claim-slot:l2-dyskinesis", "statement": "Observable scapular dyskinesis is common in people without shoulder pain and, on its own, does not identify shoulder injury.", "candidateSources": [KIBLER, PLUMMER], "note": "Wording must stay within the consensus statement and the known-groups study; no causal claim."},
]
l2_scen = [
  {"prompt": "One shoulder blade lifts a little from the ribs as a client lowers from overhead; no pain, no warning signs.", "goodAnswer": "Continue with a load and range they control; note it; no referral without warning signs.", "safety": "SAFETY.md sections 1 and 3"},
  {"prompt": "Same client, but the shoulder aches more with each rep.", "goodAnswer": "Stop shoulder loading for this session. If the pain is getting worse, routine referral now; if it has not improved after 2 weeks, routine referral then; urgent or emergency if any of those signs appear.", "safety": "SAFETY.md sections 3 and 4"},
]

notes1 = ["The anatomy ids are verified Uberon terms.", "Diagrams are slots only; the original SVGs are still to be drawn.", "The outline's video slots C2 and C1 are not placed yet (no ids until admission)."]
notes2 = ["The anatomy ids are verified Uberon terms.", "Video slots C5 and C2 are not placed yet.", "The cue paragraph is practice-based; it refers back to the science block but makes no new claim."]

(out / "01-shoulder-anatomy.json").write_text(json.dumps(draft(1, l1, l1_slots, l1_scen, notes1), indent=2, ensure_ascii=False) + "\n")
(out / "02-scapulohumeral-rhythm.json").write_text(json.dumps(draft(2, l2, l2_slots, l2_scen, notes2), indent=2, ensure_ascii=False) + "\n")
print("written")

# ---------------------------------------------------------------- lessons 3 and 4
BARRETT = {"kind": "systematic_review", "citation": "Barrett E, O'Keeffe M, O'Sullivan K, Lewis J, McCreesh K. Is thoracic spine posture associated with shoulder pain, range of motion and function? A systematic review. Man Ther. 2016;26:38-46.", "doi": "10.1016/j.math.2016.07.008", "pmid": "27475532"}
HEGEDUS = {"kind": "meta_analysis", "citation": "Hegedus EJ, Goode AP, Cook CE, et al. Which physical examination tests provide clinicians with the most value when examining the shoulder? Update of a systematic review with meta-analysis of individual tests. Br J Sports Med. 2012;46(14):964-978.", "doi": "10.1136/bjsports-2012-091066", "pmid": "22773322", "note": "Bounded historical example only."}
ZHAO = {"kind": "meta_analysis", "citation": "Zhao Q, Palani P, Kassab NS, et al. Evidence-based approach to the shoulder examination for subacromial bursitis and rotator cuff tears: a systematic review and meta-analysis. BMC Musculoskelet Disord. 2024;25(1):1028.", "doi": "10.1186/s12891-024-08144-z", "pmid": "39702033", "pmcid": "PMC11660602", "license": "CC BY-NC-ND 4.0"}

EMERGENCY = "Emergency: call emergency services now. Arm pain with chest pain, tightness or breathlessness, or the client collapses. After a fall or impact, an arm they cannot move or a shoulder that looks out of place: do not move the arm or try to put it back, and do not let them drive. A shoulder that is suddenly very painful and red or warm, or fever or feeling unwell with shoulder pain."
URGENT = "Urgent: an urgent GP appointment or NHS 111 today (or the local equivalent). Sudden or very bad pain. A new inability to lift or move the arm themselves, without an injury. Pain and weakness after an injury while the arm still moves. Any other new pain after an injury or a fall. Changed shape or bad swelling with no injury. Pins and needles that do not go away, or no feeling. An arm that feels hot or cold. Severe pain in both shoulders. A new lump. Several joints newly painful or swollen. Anyone under 18 with shoulder pain: tell a parent or carer; GP or NHS 111 the same day."
ROUTINE = "Routine: a GP or physiotherapist. Pain that is getting worse: refer now, without waiting. Pain that has not improved after 2 weeks. Movement that is very difficult but still possible. Pain and stiffness that do not go away, including pain at night. Pain that stays after you have removed the movements that provoke it."
HIGHEST = "If more than one applies, the highest tier wins."

def screen_stop(extra):
    return C(REFER, "Stop the screen, and stop shoulder loading for the rest of the session, if pain comes on or rises. " + extra + " This screen never clears anyone and never names an injury.")

l3 = {
  "id": "shoulder-03-mobility-stability", "slug": "mobility-and-stability", "title": "Mobility and stability: common restrictions",
  "summary": "A missing range is a question to look into, not a label. Learn to tell range from control, what research says about posture, and when a restriction needs referral instead of training.",
  "durationMinutes": 12, "format": "article",
  "objectives": [
    "Tell active range from passive range, and range from control.",
    "Recognise the restrictions trainers often see: overhead reach, reaching behind the back, reaching across the body.",
    "State what a systematic review found about upper-back posture and shoulder pain, and what it did not show.",
    "Decide when a restriction is a training question and when it needs referral."],
  "anatomyIds": ["UBERON:0001467", "UBERON:0001470", "UBERON:0006849"],
  "blocks": [
    P("A client cannot get the bar overhead, or one hand stops short behind the back. Before you reach for a stretch, ask two questions: how far does the shoulder go, and how well does the client control it there? And before either: is this new?"),
    H("Two coaching questions"),
    P("Mobility is the range a client can reach. Stability, in coaching terms, is how well they control that range, especially under load. They are not opposites; a good session works on both, and the answer to one changes what you do about the other."),
    H("Active and passive range"),
    P("Active range is how far the client moves the arm on their own. Passive range is how far it goes when someone else moves it, with the client relaxed. A difference between them is a reason to look closer. It is not a prescription, and this lesson draws no training rule from it."),
    C(REFER, "A new or substantial loss of active movement with no clear explanation, where the client cannot lift or move the arm themselves even though you could move it for them, is an urgent referral: an urgent GP appointment or NHS 111 today. It is never something to train. After a fall or impact, an arm they cannot move is an emergency."),
    H("What research says about posture"),
    S("A systematic review found moderate evidence of no significant difference in how rounded the upper back is (thoracic kyphosis) between people with and without shoulder pain. A result that is not significant does not prove the two groups are the same, and the studies varied in quality. The finding is about association; it does not show that posture causes or prevents shoulder pain.", "claim-slot:l3-kyphosis-pain"),
    S("In single-session studies, people reached more maximum shoulder range when sitting or standing upright than when slouched, with or without shoulder pain. Whether that matters over weeks of training is not known.", "claim-slot:l3-upright-range"),
    C("Coach note", "Avoid telling clients that their posture is damaging their shoulder; the research above does not show that. You can still use an upright set-up when it helps a lift, as a coaching choice."),
    H("Common restrictions you will see"),
    L(["Overhead reach: the arms stop short of vertical, or the lower back arches to get there.",
       "Reaching behind the back: one hand stops lower on the spine than the other.",
       "Reaching across the body: one elbow stops further from the opposite shoulder."]),
    H("How to see it"),
    L(["Ask first: is this new, and does it hurt? If it is new, unexplained or painful, go to the stop-and-refer rules before any screen.",
       "Wall reach: the client stands with their back against a wall, then raises both arms forward and up as far as is comfortable. Note where the hands stop and whether the lower back leaves the wall.",
       "Lying reach: the client lies on their back with knees bent and raises both arms overhead toward the floor behind them. Compare sides.",
       "Active then passive, only with permission: after the client raises the arm on their own, support it at the elbow and wrist and see whether it goes further without pain. Never push; stop at the first discomfort.",
       "Write down what you saw in plain words, for example: \"right hand stops about a hand's width short of the wall overhead.\""]),
    screen_stop("Pain that is getting worse over the following days: routine referral now. Stiffness or pain that has not improved after 2 weeks, or pain at night with stiffness that does not go away: routine referral. A new inability to lift the arm themselves: urgent, today. Pins and needles that do not go away: urgent, today."),
    H("What to do"),
    P("For a long-standing, familiar restriction that does not hurt and shows no warning sign: train in the range the client controls, change one thing at a time, and re-check in a later session. Anything new, unexplained or painful goes to the stop-and-refer rules first."),
    P("Some coaching systems explain restrictions with fascial lines or rib position. They can be useful ways to talk about movement with a client. Spindle does not teach them as explanations of how the body works."),
    H("Check your understanding"),
    Q("A systematic review compared upper-back rounding (thoracic kyphosis) in people with and without shoulder pain. What did it find?", ["People with shoulder pain had much more rounded upper backs", "No significant difference between the groups, with moderate evidence; that does not prove the groups are the same", "Rounding causes shoulder pain"], 1,
      "The review found moderate evidence of no significant difference in thoracic kyphosis between people with and without shoulder pain. That does not prove the groups are the same, and it does not show cause either way.", "claim-slot:l3-kyphosis-pain"),
    Q("In single-session studies, how did upright posture compare with slouching for maximum shoulder range?", ["More range when upright; whether it matters over time is not known", "Less range when upright", "No difference"], 0,
      "People reached more maximum range upright than slouched in single sessions; the long-term relevance is unclear.", "claim-slot:l3-upright-range"),
    C("Talk it through", "A client cannot reach fully overhead on either side. With permission you can lift both arms higher, and nothing hurts. What do you ask before you plan anything? Now change one thing: the right arm has lost range over the last few weeks for no reason the client knows of. What changes?"),
  ],
  "media": [], "resources": [],
}
l3_slots = [
  {"slot": "claim-slot:l3-kyphosis-pain", "statement": "A systematic review found moderate evidence of no significant difference in thoracic kyphosis between people with and without shoulder pain; a non-significant result does not establish equivalence, study quality varied, and the finding concerns association, not causation.", "candidateSources": [BARRETT], "note": "Abstract read in PubMed; the packet needs an open full text or the DOI abstract. Elsevier, rights reserved."},
  {"slot": "claim-slot:l3-upright-range", "statement": "In single-session studies, maximum shoulder range of motion is greater in erect than in slouched postures, in people with and without shoulder pain; long-term relevance is unclear.", "candidateSources": [BARRETT], "note": "Keep the single-session and unclear-relevance qualifiers."},
]
l3_scen = [
  {"prompt": "Both arms stop short overhead; passive range is higher and painless; long-standing.", "goodAnswer": "Ask whether it is new or painful. If long-standing and painless with no warning sign: train in the controlled range, change one thing, re-check in a later session.", "safety": "SAFETY.md sections 1 and 3"},
  {"prompt": "The right arm has lost range over recent weeks with no known reason; the client cannot lift it as high themselves.", "goodAnswer": "New unexplained loss of active movement: stop shoulder work; urgent GP or NHS 111 today.", "safety": "SAFETY.md sections 3 and 4"},
  {"prompt": "Stiffness for months with pain at night, slowly getting worse.", "goodAnswer": "Do not progress shoulder loading; routine referral now (getting worse).", "safety": "SAFETY.md sections 3 and 4"},
]

l4 = {
  "id": "shoulder-04-screens-red-flags", "slug": "screens-and-red-flags", "title": "Assessments, screens and red flags",
  "summary": "Screens show a trainer where to look and when to stop. They never diagnose and never clear anyone. Learn three simple screens, the questions to ask first, and the warning signs that end the session.",
  "durationMinutes": 15, "format": "article",
  "objectives": [
    "Ask the questions that bring warning signs to light before you train the shoulder.",
    "Run three simple screens, each with a clear start position and what to look for.",
    "Explain why a trainer's screen can neither diagnose nor clear a shoulder.",
    "Choose the right referral tier from what you see and hear."],
  "anatomyIds": ["UBERON:0001467", "UBERON:0001470"],
  "blocks": [
    P("A screen is a short, repeatable look at how a shoulder moves today. It helps you choose a starting point and notice change. It is not a test, and it is never the reason someone is allowed to train."),
    H("What a screen is, and is not"),
    S("Even in clinicians' hands, no single physical examination test can be recommended for diagnosing a specific shoulder condition on its own, and much of the research on these tests is low in quality.", "claim-slot:l4-single-tests"),
    P("A trainer's screen is simpler still. It shows how a movement looks today. It never diagnoses, it never clears anyone for training, and a \"normal\" screen does not outweigh a warning sign."),
    H("Before you screen: ask"),
    L(["Did anything happen to the shoulder recently: a fall, an impact, a joint that popped out?",
       "Any pins and needles, numbness or loss of feeling in the arm or hand?",
       "Is there anything you cannot do with the arm that you could do recently, like lifting it yourself?",
       "Does it hurt at night, or is it getting worse?",
       "Do you have a fever or feel unwell? Any chest pain or breathlessness?",
       "Is a doctor or physiotherapist treating this shoulder or your neck, or have you had surgery on it?",
       "For younger clients: are you under 18?"]),
    C("Emergency", EMERGENCY + " " + HIGHEST),
    C("Urgent", URGENT + " " + HIGHEST),
    C("Routine", ROUTINE + " " + HIGHEST),
    C("Outside this module", "Recent surgery or a recent dislocation or fracture still in rehabilitation, a diagnosed neurological condition, or a diagnosed shoulder condition under current care: work only within the treating clinician's plan, and do not progress it on your own. Anyone under 18 with shoulder pain: urgent, as above."),
    H("Screen 1: arm raise from behind"),
    L(["Start: the client stands relaxed, arms by the sides, in a top that lets you see the shoulder blades. Stand behind them.",
       "Ask them to raise both arms forward and up as far as is comfortable, then lower slowly. Three to five times.",
       "Look for: how high each arm goes, whether both shoulder blades move at a similar time and amount, and whether one lifts away from the ribs on the way down.",
       "A side-to-side difference tells you where to look in training. It does not tell you why."]),
    screen_stop("If the client cannot lift the arm themselves and there was no injury: urgent, today. After a fall or impact, an arm they cannot move or a shoulder that looks out of place: emergency, now. Pins and needles that do not go away: urgent, today."),
    H("Screen 2: rotation range"),
    L(["Start: the client stands with the elbow at the side, bent to a right angle, thumb up.",
       "Ask them to turn the forearm outward, then inward across the body, without moving the elbow. Compare sides.",
       "Then, if comfortable, with the arm out to the side at shoulder height and the elbow bent, ask them to rotate the hand up and down. Compare sides.",
       "The client moves the arm; you do not push it.",
       "For throwing athletes, read lesson 7 before drawing any conclusion from a difference between sides."]),
    screen_stop("Weakness with pain after an injury, while the arm still moves: urgent, today. A new inability to turn or lift the arm themselves: urgent, today. Pain that is getting worse over the following days: routine referral now."),
    H("Screen 3: reach patterns"),
    L(["Start: the client stands relaxed.",
       "Reach over the shoulder to touch the upper back, one side at a time. Note where the fingertips reach.",
       "Reach behind the back and up the spine, one side at a time. Note where the thumb reaches.",
       "Compare sides, and compare with last time."]),
    screen_stop("Stiffness or pain that has not improved after 2 weeks, or pain at night with stiffness that does not go away: routine referral. Severe pain in both shoulders, or several joints newly painful or swollen: urgent, today."),
    H("What to do with what you saw"),
    P("Write down what you saw in plain words, without a diagnosis. Then choose: train as planned, adjust the plan for the next session, or refer, and say which tier. Re-check the same screen the same way in a later session."),
    P("When you refer, keep it calm and specific: \"I noticed you can't lift your arm as high as last week and it's new. That's worth getting checked today by a GP or NHS 111. We'll work on your lower body for the rest of the session.\" Do not name a condition, and do not say it is nothing."),
    H("Check your understanding"),
    Q("Can a trainer use one screen to diagnose a shoulder problem or to clear a shoulder for training?", ["Yes, if the screen is done carefully", "No: even clinicians' single tests cannot identify a condition on their own", "Only if the client has no pain"], 1,
      "No single examination test identifies a specific shoulder condition, even for clinicians; a trainer's screen never diagnoses and never clears anyone.", "claim-slot:l4-single-tests"),
    Q("What is the quality of the research on clinicians' physical examination tests for common shoulder conditions?", ["Mostly high quality and conclusive", "Mostly low quality", "There is no research"], 1,
      "A 2024 systematic review described a large body of low-quality evidence for these tests.", "claim-slot:l4-single-tests"),
    C("Talk it through", "Pick the tier for each, and say what you do first: (1) after a fall in class, the shoulder looks out of place; (2) after catching a heavy bar, pain and weakness lifting the arm, but it still moves and looks normal; (3) pins and needles in the arm that have not gone away; (4) a mild ache after last week's pressing that settled within a day, with no pain during sets; (5) pain that has not improved after 2 weeks of leaving out the movements that provoke it; (6) a 16-year-old says the shoulder hurts after training."),
  ],
  "media": [], "resources": [],
}
l4_slots = [
  {"slot": "claim-slot:l4-single-tests", "statement": "No single physical examination test can be recommended to make a definitive diagnosis of a specific shoulder condition, and the evidence on these tests is largely low quality.", "candidateSources": [ZHAO, HEGEDUS], "note": "Zhao 2024 is open (CC BY-NC-ND 4.0) and is the primary source; Hegedus 2012 concludes that no single test can be recommended for a definitive diagnosis and is kept as a bounded historical example."},
]
l4_scen = [
  {"prompt": "After a fall in class, the shoulder looks out of place.", "goodAnswer": "Emergency: call emergency services; do not move the arm or try to put it back.", "safety": "SAFETY.md section 4"},
  {"prompt": "After catching a heavy bar: pain and weakness lifting the arm; it still moves and looks normal.", "goodAnswer": "Urgent: stop; urgent GP or NHS 111 today.", "safety": "SAFETY.md sections 3 and 4"},
  {"prompt": "Pins and needles in the arm that have not gone away.", "goodAnswer": "Urgent: stop; urgent GP or NHS 111 today.", "safety": "SAFETY.md section 4"},
  {"prompt": "A mild ache after last week's pressing that settled within a day; no pain during sets; no warning signs.", "goodAnswer": "Continue; consider load or range for this session; stop if pain comes on during a set.", "safety": "SAFETY.md section 3"},
  {"prompt": "Pain that has not improved after 2 weeks of leaving out the provoking movements.", "goodAnswer": "Routine: GP or physiotherapist.", "safety": "SAFETY.md section 4"},
  {"prompt": "A 16-year-old says the shoulder hurts after training.", "goodAnswer": "Urgent: stop shoulder loading; tell a parent or carer; GP or NHS 111 the same day for referral to trauma and orthopaedics.", "safety": "SAFETY.md sections 2 and 4"},
]
notes3 = ["Practice blocks give coaching choices only; neither science section is kept if its claim is not approved (removed, never relabelled).", "The diagram and video slots in the outline are not placed yet."]
notes4 = ["Every screen has its own stop-and-refer block beside it; the tier callouts follow SAFETY.md section 4 in trainer words.", "Adverse-case scenarios stay ungraded until claims support them.", "Screen 2 points throwers to lesson 7 and makes no claim about thrower range here."]
(out / "03-mobility-and-stability.json").write_text(json.dumps(draft(3, l3, l3_slots, l3_scen, notes3), indent=2, ensure_ascii=False) + "\n")
(out / "04-screens-and-red-flags.json").write_text(json.dumps(draft(4, l4, l4_slots, l4_scen, notes4), indent=2, ensure_ascii=False) + "\n")
print("written 3 and 4")

# ---------------------------------------------------------------- lessons 5 to 8
import re as _re
BESS25 = {"kind": "consensus", "citation": "Pandey RA, Singh HP, BESS Subacromial Pain Working Group. BESS Patient Care Pathway: Subacromial pain. Shoulder Elbow. 2025;17(6):713-724.", "doi": "10.1177/17585732251374282", "url": "https://bess.ac.uk/wp-content/uploads/2026/03/Subacromial-Shoulder-Pain-2025.pdf", "license": "(c) The Author(s) 2025; no licence stated (treat as all rights reserved)"}
CSAW = {"kind": "paper", "citation": "Beard DJ, Rees JL, Cook JA, et al. Arthroscopic subacromial decompression for subacromial shoulder pain (CSAW): a multicentre, pragmatic, parallel group, placebo-controlled, three-group, randomised surgical trial. Lancet. 2018;391(10118):329-338.", "doi": "10.1016/S0140-6736(17)32457-1", "pmid": "29169668"}
NAUNTON = {"kind": "meta_analysis", "citation": "Naunton J, Street G, Littlewood C, Haines T, Malliaras P. Effectiveness of progressive and resisted and non-progressive or non-resisted exercise in rotator cuff related shoulder pain: a systematic review and meta-analysis of randomized controlled trials. Clin Rehabil. 2020;34(9):1198-1216.", "doi": "10.1177/0269215520934147", "pmid": "32571081"}
ACSM = {"kind": "position_stand", "citation": "American College of Sports Medicine. American College of Sports Medicine position stand. Progression models in resistance training for healthy adults. Med Sci Sports Exerc. 2009;41(3):687-708.", "doi": "10.1249/MSS.0b013e3181915670", "pmid": "19204579"}
SCHOENFELD = {"kind": "meta_analysis", "citation": "Schoenfeld BJ, Ogborn D, Krieger JW. Dose-response relationship between weekly resistance training volume and increases in muscle mass: a systematic review and meta-analysis. J Sports Sci. 2017;35(11):1073-1082.", "doi": "10.1080/02640414.2016.1210197", "pmid": "27433992"}
REFALO = {"kind": "meta_analysis", "citation": "Refalo MC, Helms ER, Trexler ET, Hamilton DL, Fyfe JJ. Influence of resistance training proximity-to-failure on skeletal muscle hypertrophy: a systematic review with meta-analysis. Sports Med. 2023;53(3):649-665.", "doi": "10.1007/s40279-022-01784-y", "pmid": "36334240", "pmcid": "PMC9935748", "license": "CC BY 4.0"}
FLEISIG = {"kind": "paper", "citation": "Fleisig GS, Andrews JR, Dillman CJ, Escamilla RF. Kinetics of baseball pitching with implications about injury mechanisms. Am J Sports Med. 1995;23(2):233-239.", "doi": "10.1177/036354659502300218", "pmid": "7778711"}
PAUL = {"kind": "systematic_review", "citation": "Paul RW, Sirch FR, Vata A, Zhu E, Alberta FG, et al. Chronic adaptations of the shoulder in baseball pitchers: a systematic review. Am J Sports Med. 2025;53(12):2984-2994.", "doi": "10.1177/03635465251317202", "pmid": "40029165"}
POZZI = {"kind": "meta_analysis", "citation": "Pozzi F, Plummer HA, Shanley E, et al. Preseason shoulder range of motion screening and in-season risk of shoulder and elbow injuries in overhead athletes: systematic review and meta-analysis. Br J Sports Med. 2020.", "doi": "10.1136/bjsports-2019-100698", "pmid": "31937577", "pmcid": "PMC7456673", "license": "CC BY"}
SALAMH = {"kind": "systematic_review", "citation": "Salamh P, Bullock G, Chester R, Daniell H, et al. Risk factors associated with new onset of shoulder pain and injury among the athletic population: a systematic review of the literature. Int J Sports Phys Ther. 2025;20(3).", "doi": "10.26603/001c.129462", "license": "CC BY-NC 4.0"}
KELLER = {"kind": "meta_analysis", "citation": "Keller RA, De Giacomo AF, Neumann JA, et al. Glenohumeral internal rotation deficit and risk of upper extremity injury in overhead athletes: a meta-analysis and systematic review. Sports Health. 2018;10(2):125-132.", "doi": "10.1177/1941738118756577", "pmid": "29381423", "pmcid": "PMC5857737"}

POLICY = "Spindle policy"
BOUNDARY = "Your training is not treatment for a diagnosed condition. A client with diagnosed shoulder pain, or one recovering from surgery, a dislocation or a fracture, trains within the treating clinician's plan, and you do not progress that plan on your own. This is Spindle's rule for trainers, not a research finding."
def stop_beside(text):
    return C(REFER, "Do not progress, and stop shoulder loading for the rest of the session, if pain comes on or rises with load, if the client cannot control the range, or if any warning sign appears. " + text)

l5 = {
  "id": "shoulder-05-correctives", "slug": "correctives-and-activation", "title": "Correctives and activation: what the evidence supports",
  "summary": "What exercise research on shoulder pain actually compared, what it did not, and how to use activation drills as a warm-up rather than a fix.",
  "durationMinutes": 12, "format": "article",
  "objectives": [
    "Describe what research reports about exercise for subacromial shoulder pain, and for whom.",
    "Explain why that clinical research is not a trainer's treatment plan.",
    "Use activation drills as warm-up and rehearsal, without ranking them.",
    "Know when a \"corrective\" should be a referral instead."],
  "anatomyIds": ["UBERON:0001467", "UBERON:0003683", "UBERON:0006849"],
  "blocks": [
    P("\"Correctives\" and \"activation\" are some of the most used words in shoulder training. This lesson separates what the research tested from what is coaching practice, so you can use both honestly."),
    H("What research reports, and for whom"),
    S("For subacromial shoulder pain, a specific condition that a clinician diagnoses, UK specialist guidance reports evidence that exercise reduces pain in the short term (8 weeks to 6 months) and improves function. It also says that the most effective exercise approach remains uncertain.", "claim-slot:l5-subacromial-exercise"),
    S("In a large trial of people with subacromial shoulder pain, surgery to decompress the space gave no extra benefit over an arthroscopy without decompression, and neither surgery gave a clinically important benefit over no treatment.", "claim-slot:l5-csaw"),
    S("For rotator cuff related shoulder pain, a 2020 systematic review compared each type of exercise with placebo or no treatment, not with each other. Progressive resisted exercise showed an uncertain clinical benefit, non-progressive exercise showed no significant benefit, and the certainty of the evidence was low.", "claim-slot:l5-progressive-comparisons"),
    C(POLICY, BOUNDARY),
    H("Scapular exercise and muscle activity"),
    S("Studies that record muscle activity (EMG) show that some exercises produce high activity in the serratus anterior and lower trapezius relative to the upper trapezius. Muscle activity during one session is not the same as gaining strength or changing symptoms.", "claim-slot:l5-emg"),
    P("Use that research to understand what an exercise asks of the shoulder blade muscles. It does not make any exercise the best one, and this lesson names none."),
    H("What activation is for"),
    P("In a session, activation drills are rehearsal and warm-up: they get the client's attention on a position and raise the body's readiness to train. They are not a fix, and they do not need to take long."),
    H("How to see it"),
    P("Can the client hold the position you want under a light load, with smooth movement and no pain? Re-check the screen from lesson 4 the same way in a later session to see whether anything changed."),
    H("A short shoulder warm-up"),
    L(["Position: set up the stance or support you will use in the first lift. Easier version: support the back against a wall or bench.",
       "Light rotation: elbow at the side, turn the forearm out and back with a light band, 8 to 12 slow reps. Easier version: no band.",
       "Shoulder blade control: reach the arms forward and let the shoulder blades travel around the ribs, then reach overhead along a wall. Easier version: reach only as high as is comfortable.",
       "First pattern: the session's first press or pull with a light load, one to three cues only."]),
    stop_beside("A warm-up drill that hurts is not a warm-up; skip it and refer if the pain is getting worse or has not improved after 2 weeks. A new inability to lift the arm themselves: urgent, today."),
    H("Cues"),
    P("Give one to three cues per drill, as a direction or a target: \"reach long through your hands\", \"push the band away\". Watch the next rep, and keep a cue only if the movement changes the way you want."),
    C(REFER, "Correctives never replace referral. Any stop rule means stop for the session. Pain that is getting worse: routine referral now. Pain that has not improved after 2 weeks: routine referral. Anything in the urgent or emergency tiers: refer at that tier (see \"When to refer out\")."),
    H("Check your understanding"),
    Q("What does UK specialist guidance report about exercise for subacromial shoulder pain?", ["It reduces pain in the short term and improves function; the most effective approach is uncertain", "One exercise programme is proven best", "Exercise does not help"], 0,
      "The guidance reports evidence that exercise reduces short-term pain and improves function, and says the most effective approach remains uncertain.", "claim-slot:l5-subacromial-exercise"),
    Q("How did the 2020 review compare progressive and non-progressive exercise for rotator cuff related shoulder pain?", ["It found progressive exercise clearly better than non-progressive", "It compared each with placebo or no treatment, not with each other, and the evidence was low certainty", "It found no difference between them in a head-to-head comparison"], 1,
      "Each approach was compared with placebo or no treatment; the review did not compare them head to head, and certainty was low.", "claim-slot:l5-progressive-comparisons"),
    Q("An exercise shows high serratus anterior activity on EMG. What does that tell you on its own?", ["It builds more strength than other exercises", "It asks a lot of that muscle in that session; it does not show strength gain", "It fixes shoulder pain"], 1,
      "EMG shows muscle activity during the exercise. Activity in one session is not the same as strength gain or symptom change.", "claim-slot:l5-emg"),
    C("Talk it through", "A client wants to spend 20 minutes on activation before every session. What do you keep as a short warm-up, and what moves into the main session as real training?"),
  ],
  "media": [], "resources": [],
}
l5_slots = [
  {"slot": "claim-slot:l5-subacromial-exercise", "statement": "For subacromial shoulder pain, BESS guidance reports evidence that exercise reduces pain in the short term (8 weeks to 6 months) and improves patient-reported function, and states that the most effective physiotherapy or exercise approach remains uncertain.", "candidateSources": [BESS25], "note": "The guidance says nothing exclusive about who delivers exercise; it also describes self-management. The claim does not mention delivery."},
  {"slot": "claim-slot:l5-csaw", "statement": "In the CSAW trial of people with subacromial shoulder pain, arthroscopic decompression gave no extra benefit over arthroscopy only, and the surgical groups' advantage over no treatment at 6 months was not clinically important.", "candidateSources": [CSAW], "note": "Lancet; Elsevier user licence. Keep within the trial population."},
  {"slot": "claim-slot:l5-progressive-comparisons", "statement": "A 2020 systematic review found uncertain clinical benefit for progressive resisted exercise and no significant benefit for non-progressive exercise, each versus placebo or no treatment, in rotator cuff related shoulder pain; evidence was low certainty and the two were not compared directly.", "candidateSources": [NAUNTON]},
  {"slot": "claim-slot:l5-emg", "statement": "EMG studies show some exercises elicit high serratus anterior and lower trapezius activity relative to upper trapezius; muscle activation during an exercise does not by itself demonstrate strength gain or symptom change.", "candidateSources": [REINOLD], "note": "The second clause needs explicit support in the packet; if absent, keep it out of the science block."},
]
l5_scen = [{"prompt": "A client wants 20 minutes of activation before every session.", "goodAnswer": "Keep a short warm-up (a few minutes); move strengthening into the main session with progressive load; no claim that activation fixes anything.", "safety": "SAFETY.md section 1"}]

l6 = {
  "id": "shoulder-06-loading", "slug": "loading-the-shoulder", "title": "Loading the shoulder: pressing, pulling, overhead, progressions",
  "summary": "Shoulders get stronger the way everything else does: progressive load through a range the client controls. Choose variations, progress one thing at a time, and know the signs that mean do not progress.",
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
    S("For continued gains in strength, resistance training has to progress: load, volume or difficulty increases over time.", "claim-slot:l6-progression"),
    C(POLICY, BOUNDARY),
    H("Before any progression"),
    C(REFER, "Check first: no pain during the current level, full control of the range, and no warning sign since the last session. If pain comes on or rises with load, stop shoulder loading for the rest of the session. Pain that is getting worse: routine referral now. Pain that has not improved after 2 weeks: routine referral. Anything in the urgent or emergency tiers: refer at that tier."),
    H("Pressing"),
    P("Push-ups, presses with dumbbells or a bar, and the landmine press load the shoulder from different angles. Choose by the range the client controls without pain and by the goal. Define your cue before you use it: \"push the floor away\" asks the shoulder blades to move around the ribs at the top of a push-up; \"bend the bar\" asks for tension through the upper back before the press."),
    L(["Progression: push-up from a raised surface, then a lower surface, then the floor.",
       "Progression: dumbbell press through a shorter range first (stopping before the bottom), then the full range the client controls.",
       "Progression: add load only after the current range is controlled for all reps."]),
    stop_beside("Pain at the bottom of a press is a reason to stop for the session, not to push through. Next session, if no warning sign remains, try a shorter range or another variation."),
    H("Pulling"),
    P("Rows and pulldowns train the muscles that move the shoulder blade and the arm back and down. Let the shoulder blades move with the arm rather than locking them, and keep pulling work in the programme alongside pressing."),
    L(["Progression: supported row (chest on a bench), then an unsupported row, then heavier load.",
       "Progression: band pulldown, then a cable or machine pulldown, then a pull-up with assistance."]),
    stop_beside("Pins and needles in the arm or hand that do not go away: urgent, today."),
    H("Overhead"),
    S("Reaching fully overhead involves the shoulder blade rotating upward as the arm rises.", "claim-slot:l6-overhead-upward"),
    P("Pick an overhead variation from what the client can reach and control. A landmine press asks for less overhead range than a vertical press; a half-kneeling press removes some help from the legs and lower back; a standing press asks for the most."),
    L(["Progression: landmine press, then half-kneeling single-arm press, then standing press.",
       "Do not progress to a vertical press until the client reaches overhead without pain and without arching the lower back to get there."]),
    stop_beside("A new inability to lift the arm themselves: urgent, today. After a fall or impact, an arm they cannot move or a shoulder that looks out of place: emergency, now."),
    H("Building muscle"),
    S("In a meta-analysis, more weekly sets per muscle were associated with greater gains in muscle size, in a dose-response pattern.", "claim-slot:l6-volume"),
    S("A meta-analysis found no evidence that training to momentary muscular failure is better than stopping short of failure for muscle growth.", "claim-slot:l6-failure"),
    P("For shoulders, add weekly sets gradually and keep a few reps in reserve on most sets; you can always add more next week."),
    stop_beside("If adding volume brings on pain that persists between sessions, go back to the last pain-free volume and refer if the pain is getting worse or has not improved after 2 weeks."),
    H("Progress one thing at a time"),
    P("Change range, then load, then difficulty, one at a time, and re-check the client's control at each step in a later session. If two things change and pain appears, you will not know which caused it."),
    stop_beside("Severe pain in both shoulders, or several joints newly painful or swollen: urgent, today."),
    H("Check your understanding"),
    Q("What does continued strength gain require over time?", ["Repeating the same load indefinitely", "Progressive resistance training: load, volume or difficulty increases over time", "Training to failure on every set"], 1,
      "Continued strength gains need progression in load, volume or difficulty.", "claim-slot:l6-progression"),
    Q("Which shoulder blade movement is part of reaching fully overhead?", ["Upward rotation", "Downward rotation", "None: the shoulder blade stays still"], 0,
      "Reaching fully overhead involves upward rotation of the shoulder blade.", "claim-slot:l6-overhead-upward"),
    Q("What did a meta-analysis find about weekly sets and muscle growth?", ["More weekly sets were associated with greater gains, in a dose-response pattern", "Volume made no difference", "Fewer sets always gave more growth"], 0,
      "The meta-analysis found a graded dose-response: more weekly sets were associated with greater gains in muscle size.", "claim-slot:l6-volume"),
    Q("Is training to momentary failure better than stopping short of failure for muscle growth?", ["Yes, always", "No evidence that it is better", "It prevents growth"], 1,
      "A meta-analysis found no evidence that training to momentary failure is superior to non-failure training for muscle growth.", "claim-slot:l6-failure"),
    C("Talk it through", "During a deep dumbbell bench press, a client's shoulder starts to ache at the bottom of the set; push-ups earlier felt fine. What do you do now, and what might change next session?"),
  ],
  "media": [], "resources": [],
}
l6_slots = [
  {"slot": "claim-slot:l6-progression", "statement": "Progressive resistance training protocols are necessary to stimulate further adaptation toward strength goals in healthy adults.", "candidateSources": [ACSM], "note": "Position stand for healthy adults; keep the population."},
  {"slot": "claim-slot:l6-overhead-upward", "statement": "Full humeral elevation involves scapular upward rotation.", "candidateSources": [LUDEWIG, MCCLURE], "note": "Same evidence as l2-scapular-motions; may reuse that approved claim."},
  {"slot": "claim-slot:l6-volume", "statement": "Higher weekly resistance training volume (sets) is associated with greater increases in muscle size in a graded dose-response relationship.", "candidateSources": [SCHOENFELD]},
  {"slot": "claim-slot:l6-failure", "statement": "There is no evidence that resistance training to momentary muscular failure is superior to non-failure training for muscle hypertrophy.", "candidateSources": [REFALO]},
]
l6_scen = [{"prompt": "Ache at the bottom of a deep dumbbell bench press during the set; push-ups fine.", "goodAnswer": "Now: stop shoulder loading for the session. Next session, only if no warning sign remains: shorter range or another variation, stop again if pain comes on. Refer routinely if getting worse, or not improved after 2 weeks.", "safety": "SAFETY.md sections 3 and 4"}]

l7 = {
  "id": "shoulder-07-throwing", "slug": "throwing-and-rotation", "title": "Throwing and rotation",
  "summary": "Throwing puts the shoulder through fast, large rotations. Support throwers with strength and sensible workload, compare range over time, and know the warning signs.",
  "durationMinutes": 12, "format": "article",
  "objectives": [
    "Describe when shoulder loads peak during a pitch.",
    "Describe the range differences pitchers' throwing shoulders typically show.",
    "Explain why range is not a reliable injury screen on its own.",
    "Know the warning signs in throwers, and refer young throwers with shoulder pain urgently."],
  "anatomyIds": ["UBERON:0001467", "UBERON:0001470", "UBERON:0000976"],
  "blocks": [
    P("This lesson gives a strength coach's view of the throwing shoulder. Throwing workload and return-to-throwing decisions belong to the athlete's sport coach and clinician."),
    H("Where the load peaks"),
    S("In skilled adult pitchers, the largest shoulder loads come at two moments: shortly before the arm reaches its maximum external rotation during arm cocking, and shortly after ball release, when the shoulder must slow the arm down.", "claim-slot:l7-load-peaks"),
    H("How pitchers' shoulders adapt"),
    S("In professional baseball pitchers, the throwing shoulder typically has less internal rotation and more external rotation than the other shoulder. Part of that difference comes from a twist in the upper arm bone itself (humeral retroversion), not only from the soft tissues.", "claim-slot:l7-adaptation"),
    H("Range and injury risk: still uncertain"),
    S("Whether shoulder range predicts injury is uncertain and depends on the sport. A 2018 meta-analysis found no range measure that significantly predicted injury in overhead athletes. A 2020 meta-analysis of prospective studies linked too little extra external rotation in the throwing arm to injury in professional pitchers, from three pooled studies, with a caution about the small number of studies, and found range screening may not identify risk in some other overhead sports. A 2025 review listed range among several risk factors, alongside reduced strength, previous pain or injury and training load.", "claim-slot:l7-injury-risk"),
    P("So do not set out to make a thrower's two shoulders match, and do not treat one range number as a verdict. Compare total rotation between sides and over time, measured the same way."),
    H("How to see it"),
    L(["Measure rotation the same way each time: same position, same time of day, before training.",
       "Record both sides and the total (outward plus inward) for each.",
       "Look for change across the season, not for a single number."]),
    C(REFER, "Stop the measurement if it hurts. Pain at rest or at night, pins and needles, or a new inability to lift the arm: urgent, today. Any thrower under 18 with shoulder pain: urgent, today; tell a parent or carer."),
    H("What to do"),
    P("Build strength for the rotator cuff and the shoulder blade muscles, rotation strength through the trunk and hips, and the ability to slow the arm down. Progress one thing at a time, with the same stop rules as lesson 6."),
    C(POLICY, "Throwing workload, pitch counts and return-to-throwing decisions are for the athlete's sport coach and treating clinician. Your strength work supports that plan; it does not replace it. " + BOUNDARY),
    C(REFER, "Stop throwing and shoulder loading for the session if the athlete has pain while throwing, loses velocity with pain, describes a \"dead arm\", or has numbness or tingling. Refer at the tier that matches (see \"When to refer out\"). A thrower under 18 with shoulder pain: urgent, an urgent GP appointment or NHS 111 the same day, for referral to trauma and orthopaedics, with a parent or carer told."),
    P("Other rotational sports, such as racquet sports, swimming and combat sports, load the shoulder in related ways. Use the same approach: compare over time, build strength, and follow the stop rules."),
    H("Check your understanding"),
    Q("In skilled adult pitchers, when are shoulder loads highest?", ["Just before maximum external rotation in arm cocking, and just after ball release", "During the wind-up", "During the follow-through only"], 0,
      "The largest shoulder loads occur shortly before maximum external rotation in arm cocking and shortly after ball release.", "claim-slot:l7-load-peaks"),
    Q("What range pattern does a professional pitcher's throwing shoulder typically show?", ["Less internal rotation and more external rotation than the other side", "More internal rotation and less external rotation", "Identical range on both sides"], 0,
      "The throwing shoulder typically shows less internal and more external rotation, partly from a bony twist in the upper arm bone.", "claim-slot:l7-adaptation"),
    Q("Can shoulder range alone tell you which overhead athletes will be injured?", ["Yes, reliably in every sport", "No: the evidence is uncertain and differs by sport", "Only in swimmers"], 1,
      "Syntheses disagree and differ by sport; range is one possible factor among several, not a reliable screen on its own.", "claim-slot:l7-injury-risk"),
    C("Talk it through", "A 15-year-old pitcher says the shoulder hurts after games. What do you do in your session, and who do you tell?"),
  ],
  "media": [], "resources": [],
}
l7_slots = [
  {"slot": "claim-slot:l7-load-peaks", "statement": "In skilled healthy adult pitchers, critical shoulder kinetics occur shortly before maximum shoulder external rotation (arm cocking) and shortly after ball release (high compressive force).", "candidateSources": [FLEISIG]},
  {"slot": "claim-slot:l7-adaptation", "statement": "In professional baseball pitchers, the throwing shoulder shows on average less internal rotation and more external rotation than the non-throwing shoulder, with a bilateral difference in humeral retroversion contributing.", "candidateSources": [PAUL], "note": "Population is mostly professional pitchers; keep it."},
  {"slot": "claim-slot:l7-injury-risk", "statement": "Evidence on shoulder range of motion as a predictor of injury in overhead athletes is uncertain and sport-specific: no significant pooled predictor in a 2018 meta-analysis; external rotation insufficiency associated with injury in professional pitchers (three pooled studies, caution) in a 2020 meta-analysis of prospective cohorts; range among several risk factors in a 2025 systematic review with inconsistent injury definitions.", "candidateSources": [KELLER, POZZI, SALAMH]},
]
l7_scen = [{"prompt": "A 15-year-old pitcher says the shoulder hurts after games.", "goodAnswer": "Stop throwing and shoulder loading in the session; urgent: tell the athlete and a parent or carer to get an urgent GP appointment or NHS 111 the same day for referral to trauma and orthopaedics; emergency if any emergency sign.", "safety": "SAFETY.md sections 2 and 4"}]

# Lesson 8 mirrors SAFETY.md: its lists are parsed from the safety rules, not rewritten.
SAFETY_MD = (pathlib.Path(sys.argv[1]).parents[2] / "docs/curriculum/SAFETY.md").read_text()
def _clean(t):
    t = _re.sub(r"\*\*", "", t)
    t = _re.sub(r"\s*\[S\d+\](,\s*\[S\d+\])*", "", t)
    # Section numbers mean nothing inside a lesson; point to the lists on this page instead.
    t = t.replace("Use the referral tiers in section 4.", "Use the referral tiers above.").replace("from section 3 or 4", "in the lists above").replace("See sections 3 and 4.", "See the lists above.").replace("(section 4 note)", "(see the note on infection)")
    return t.strip()
def safety_rows(heading, cols):
    sec = SAFETY_MD.split(heading, 1)[1]
    rows = []
    for line in sec.split("\n"):
        if line.startswith("|") and not line.startswith("|---"):
            cells = [c.strip() for c in line.strip("|").split("|")]
            if cells[0] in ("Criterion", "Stop when", "Population"): continue
            rows.append(" - ".join(_clean(cells[i]) for i in cols))
        elif rows and not line.startswith("|"):
            break
    assert rows, heading
    return rows
EMERG_ROWS = safety_rows("### Emergency:", [0])
URG_ROWS = safety_rows("### Urgent:", [0])
ROUT_ROWS = safety_rows("### Routine:", [0])
STOP_ROWS = safety_rows("## 3. Stop rules", [0, 1])
EXCL_ROWS = safety_rows("## 2. Excluded populations", [0, 1])
INFECTION_NOTE = _clean(SAFETY_MD.split("Note on infection: ", 1)[1].split("\n", 1)[0])

l8 = {
  "id": "shoulder-08-refer-out", "slug": "when-to-refer-out", "title": "When to refer out",
  "summary": "Referral is a coaching skill: notice, stop, refer to the right place at the right speed, and keep the client training what is safe.",
  "durationMinutes": 15, "format": "article",
  "objectives": [
    "Apply the three referral tiers, with the highest matching tier winning.",
    "Use the stop rules and say what to do next.",
    "Know who is outside the base module and how to work alongside a clinician's plan.",
    "Refer in plain, calm, non-diagnostic words."],
  "anatomyIds": ["UBERON:0001467"],
  "blocks": [
    P("Every lesson in this module has put a stop-and-refer box beside its screens and progressions. This lesson puts them all in one place. The lists below come straight from Spindle's shoulder safety rules."),
    H("Your scope"),
    P("A trainer does not diagnose or treat injuries. A trainer notices, stops, and refers. Describe what you see, never name a condition, and never tell a client a screen has cleared them."),
    C(POLICY, BOUNDARY),
    H("Which tier: the highest one that matches"),
    P("Use the highest tier that any sign matches. An emergency sign overrides every urgent or routine sign, and an urgent sign overrides every routine sign."),
    H("Emergency: call emergency services now (999 in the UK)"),
    {"kind": "checklist", "content": EMERG_ROWS, "support": "practice-based", "claimIds": []},
    C("Note on infection", INFECTION_NOTE),
    H("Urgent: an urgent GP appointment or NHS 111 today (or the local equivalent)"),
    {"kind": "checklist", "content": URG_ROWS, "support": "practice-based", "claimIds": []},
    H("Routine: a GP or physiotherapist"),
    {"kind": "checklist", "content": ROUT_ROWS, "support": "practice-based", "claimIds": []},
    H("Stop rules"),
    P("Stop always means no further loading of that shoulder in this session. Changes to range, load or variation belong to a later session, and only if no warning sign remains."),
    {"kind": "checklist", "content": STOP_ROWS, "support": "practice-based", "claimIds": []},
    H("Outside the base module"),
    {"kind": "checklist", "content": EXCL_ROWS, "support": "practice-based", "claimIds": []},
    H("Keeping routine referrals calm"),
    S("For subacromial shoulder pain, UK specialist guidance describes the condition as usually self-limiting, with most symptoms settling within about three months.", "claim-slot:l8-subacromial-course"),
    P("That keeps a routine referral calm. It is about one diagnosed condition, and it never delays an urgent or emergency referral."),
    H("The conversation"),
    L(["Say what you saw: \"Your arm isn't lifting as high as last week, and that's new.\"",
       "Say what to do and how soon: \"That's worth getting checked today by a GP or NHS 111.\"",
       "Do not name a condition, and do not say it is nothing.",
       "Keep them moving where it is safe: \"Let's work on your lower body for the rest of the session.\""]),
    H("Working with a clinician's plan"),
    P("Ask the client to share the plan, ideally in writing. Train within it, ask the clinician before changing it, and do not progress it on your own."),
    H("Check your understanding"),
    Q("For subacromial shoulder pain, what does UK specialist guidance say about how symptoms usually go?", ["Most symptoms settle within about three months", "Symptoms never settle without surgery", "Most need emergency care"], 0,
      "The guidance describes subacromial pain as usually self-limiting, with most symptoms settling within about three months.", "claim-slot:l8-subacromial-course"),
    C("Talk it through", "Pick the tier and say what you do first: (1) arm pain with chest tightness during a session; (2) a new lump above the collarbone; (3) shoulder pain that has got worse every day this week, with no other sign; (4) after a fall, the client cannot move the arm; (5) fever and shoulder pain; (6) an ache after training that settled within a day, with no other sign."),
  ],
  "media": [], "resources": [],
}
l8_slots = [
  {"slot": "claim-slot:l8-subacromial-course", "statement": "BESS guidance describes subacromial pain as usually self-limiting, with most symptoms responding within three months.", "candidateSources": [BESS25]},
]
l8_scen = [
  {"prompt": "Arm pain with chest tightness during a session.", "goodAnswer": "Emergency: stop all exercise; call emergency services.", "safety": "SAFETY.md section 4"},
  {"prompt": "A new lump above the collarbone.", "goodAnswer": "Urgent: GP or NHS 111 today.", "safety": "SAFETY.md section 4"},
  {"prompt": "Shoulder pain that has got worse every day this week; no other sign.", "goodAnswer": "Routine, now: do not wait for 2 weeks.", "safety": "SAFETY.md section 4"},
  {"prompt": "After a fall, the client cannot move the arm.", "goodAnswer": "Emergency: do not move the arm; call emergency services.", "safety": "SAFETY.md sections 3 and 4"},
  {"prompt": "Fever and shoulder pain.", "goodAnswer": "Emergency (Spindle policy, stricter than the NHS page).", "safety": "SAFETY.md section 4 note"},
  {"prompt": "An ache after training that settled within a day; no other sign.", "goodAnswer": "Continue; stop if pain comes on during a set.", "safety": "SAFETY.md section 3"},
]
notes5 = ["The outline's wording 'first-line treatment' is not in the BESS 2025 text; the lesson uses what the pathway says (exercise reduces short-term pain; best approach uncertain).", "The warm-up is practice-based and ranks nothing."]
notes6 = ["Every progression has a stop block beside it.", "The cue definitions are practice-based."]
notes7 = ["Throwing workload is stated as Spindle policy, not science.", "The adaptation claim is limited to professional pitchers."]
notes8 = ["The tier, stop-rule and exclusion checklists are generated from docs/curriculum/SAFETY.md, with the source ids removed; regenerate whenever SAFETY.md changes.", "Scenarios stay ungraded."]
for n, (lesson, slots, scen, notes, fname) in enumerate([(l5, l5_slots, l5_scen, notes5, "05-correctives-and-activation.json"), (l6, l6_slots, l6_scen, notes6, "06-loading-the-shoulder.json"), (l7, l7_slots, l7_scen, notes7, "07-throwing-and-rotation.json"), (l8, l8_slots, l8_scen, notes8, "08-when-to-refer-out.json")], start=5):
    (out / fname).write_text(json.dumps(draft(n, lesson, slots, scen, notes), indent=2, ensure_ascii=False) + "\n")
print("written 5 to 8")
