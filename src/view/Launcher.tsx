import { Button, Card, CardBody, CardHeader, Divider, Input, Select, SelectItem } from "@nextui-org/react";
import { useState } from "react";
import { motion } from "framer-motion";
import { MdHistoryEdu, MdDarkMode, MdLightMode } from "react-icons/md";
import { useModelStore } from "../model/Model";
import { extractedEntitiesToNodeEntities } from "../model/prompts/textExtractors/EntitiesExtractor";
import { extractedLocationsToNodeLocations } from "../model/prompts/textExtractors/LocationsExtractor";
import { extractedActionsToEdgeActions } from "../model/prompts/textExtractors/SentenceActionsExtractor";
import { VisualRefresher } from "../model/prompts/textExtractors/VisualRefresher";
import { dataTextAlice, textAlice } from "../study/data/TextAlice";
import { dataTextB, textB } from "../study/data/TextB";
import { dataTextD, textD } from "../study/data/TextD";
import { useStudyStore } from "../study/StudyModel";

export default function Launcher() {
  const [accessKey, setAccessKey] = useState("");
  const [pid, setPid] = useState(-1);
  const [isDark, setIsDark] = useState(() => localStorage.getItem("launcherTheme") === "dark");
  const [showSetup, setShowSetup] = useState(false);
  const setOpenAIKey = useModelStore((state) => state.setOpenAIKey);
  const resetModel = useModelStore((state) => state.reset);
  const resetStudyModel = useStudyStore((state) => state.reset);

  function startExample(text: string, data: any) {
    resetModel();
    resetStudyModel();

    useModelStore.getState().setTextState([{ children: [{ text: text }] }], true, false);
    useModelStore.getState().setIsStale(false);
    VisualRefresher.getInstance().previousText = useModelStore.getState().text;
    VisualRefresher.getInstance().onUpdate();

    if (data) {
      const entityNodes = extractedEntitiesToNodeEntities(data);
      const locationNodes = extractedLocationsToNodeLocations(data);
      const actionEdges = data.actions.map((h: any) => extractedActionsToEdgeActions({ actions: [h] }, h.passage, entityNodes)).flat();
      useModelStore.getState().setEntityNodes(entityNodes);
      useModelStore.getState().setLocationNodes(locationNodes);
      useModelStore.getState().setActionEdges(actionEdges);
    } else {
      const locationNodes = extractedLocationsToNodeLocations({
        locations: [
          {
            name: "unknown",
            emoji: "🌍",
          },
        ],
      });

      useModelStore.getState().setLocationNodes(locationNodes);
      useModelStore.getState().setEntityNodes([]);
      useModelStore.getState().setActionEdges([]);
    }

    window.location.hash = "/free-form" + `?k=${btoa(accessKey)}`;
  }

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem("launcherTheme", next ? "dark" : "light");
      return next;
    });
  };

  const scrollToPreview = () => {
    document.getElementById("launcher-preview")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className={`launcher ${isDark ? "launcherDark" : ""}`}>
      <header className="hero">
        <div className="heroContent">
          <div className="heroTop">
            <span className="heroBadge">AI-driven creative tool</span>
            <div className="headerActions">
              <Button size="sm" variant="flat" className="themeSwitch" onClick={toggleTheme}>
                <span className="themeIcon">{isDark ? <MdLightMode /> : <MdDarkMode />}</span>
                <span className="themeLabel">{isDark ? "Light" : "Dark"}</span>
              </Button>
            </div>
          </div>

          <h1 className="heroTitle">Visual Story-Writing</h1>
          <p className="heroLead">
            A visual writing environment that links your narrative texts to entities, actions, locations, and timelines. Manipulate your story through its visual structure and generate images of your
            entities to get inspired.
          </p>
          <div className="heroActions">
            <Button className="primaryBtn" onClick={() => setShowSetup(true)}>
              Get Started Now
            </Button>
            <Button variant="flat" onClick={scrollToPreview}>
              Preview Features
            </Button>
          </div>
          <div className="heroMeta">Use a Local AI or an OpenAI API key</div>
        </div>

        <div className="heroMedia">
          <img src="/images/demo.gif" alt="Hero Image" className="heroImage" />
        </div>
      </header>

      <section id="launcher-preview" className="previewSection">
        <div className="previewGrid">
          <div className="previewCard">
            <motion.div
              className="previewMedia"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              viewport={{ once: true, amount: 0.35 }}
            >
              <video controls className="previewVideo">
                <source src="/videos/Basics.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </motion.div>

            <motion.div
              className="previewText"
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 }}
              viewport={{ once: true, amount: 0.35 }}
            >
              <h3 className="mediumTitle">Basic Interactions</h3>
              <p>Manipulate entities, actions, and locations to drive text changes.</p>
            </motion.div>
          </div>

          <div className="previewCard reverse">
            <motion.div
              className="previewMedia"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              viewport={{ once: true, amount: 0.35 }}
            >
              <video controls className="previewVideo">
                <source src="/videos/Entities.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </motion.div>

            <motion.div
              className="previewText"
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 }}
              viewport={{ once: true, amount: 0.35 }}
            >
              <h3 className="mediumTitle">Entities</h3>
              <p>
                {" "}
                Lorem ipsum dolor sit amet consectetur adipisicing elit. Nostrum, incidunt ullam illo architecto soluta in culpa optio distinctio corporis. Ipsum exercitationem repudiandae fugiat
                maiores eum nisi. Placeat sequi nihil perspiciatis.{" "}
              </p>
            </motion.div>
          </div>

          <div className="previewCard">
            <motion.div
              className="previewMedia"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              viewport={{ once: true, amount: 0.35 }}
            >
              <video controls className="previewVideo">
                <source src="/videos/Locations.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </motion.div>

            <motion.div
              className="previewText"
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 }}
              viewport={{ once: true, amount: 0.35 }}
            >
              <h3 className="mediumTitle">Locations</h3>
              <p>
                Lorem ipsum dolor sit amet consectetur adipisicing elit. Fuga tempore placeat ut? Nobis id perferendis delectus ex modi, porro tenetur facilis debitis. At culpa temporibus
                exercitationem non ad deleniti consectetur?
              </p>
            </motion.div>
          </div>

          <Divider />

          <div className="miniFeature previewCard">
            <motion.div
              className="miniFeatureCard"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              viewport={{ once: true, amount: 0.35 }}
            >
              <div className="miniFeatureIcon" aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M4 7h9a5 5 0 1 1-5 5H4z" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M4 17h6" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </div>
              <div className="miniFeatureTitle">Generate</div>
              <div className="miniFeatureText">Create vivid AI images from your story entities and locations.</div>
            </motion.div>

            <motion.div
              className="miniFeatureCard"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: "easeOut", delay: 0.05 }}
              viewport={{ once: true, amount: 0.35 }}
            >
              <div className="miniFeatureIcon" aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M4 17l9-9 3 3-9 9H4z" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M14 6l3 3" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </div>
              <div className="miniFeatureTitle">Edit</div>
              <div className="miniFeatureText">Select an area and refine it with a new prompt.</div>
            </motion.div>

            <motion.div
              className="miniFeatureCard"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: "easeOut", delay: 0.1 }}
              viewport={{ once: true, amount: 0.35 }}
            >
              <div className="miniFeatureIcon" aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M8 7l-3 3 3 3M16 17l3-3-3-3" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M10 12h4" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </div>
              <div className="miniFeatureTitle">Drag & Drop</div>
              <div className="miniFeatureText">Drop a visual snippet to auto‑insert its description into your text.</div>
            </motion.div>
          </div>

          <Divider />

          <div className="previewCard reverse">
            <motion.div
              className="previewMedia"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              viewport={{ once: true, amount: 0.35 }}
            >
              <video controls className="previewVideo">
                <source src="/videos/Reading.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </motion.div>

            <motion.div
              className="previewText"
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 }}
              viewport={{ once: true, amount: 0.35 }}
            >
              <h3 className="mediumTitle">Reading</h3>
              <p>
                Lorem ipsum, dolor sit amet consectetur adipisicing elit. Eos ratione in quae exercitationem quo deserunt soluta. Expedita nam laudantium porro repellat, voluptate dolor repellendus
                sed excepturi molestias perspiciatis, possimus ullam.
              </p>
            </motion.div>
          </div>

          <div className="previewCard">
            <motion.div
              className="previewMedia"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              viewport={{ once: true, amount: 0.35 }}
            >
              <video controls className="previewVideo">
                <source src="/videos/Reorder.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </motion.div>

            <motion.div
              className="previewText"
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 }}
              viewport={{ once: true, amount: 0.35 }}
            >
              <h3 className="mediumTitle">Reorder</h3>
              <p>
                Lorem ipsum dolor sit amet consectetur adipisicing elit. Fuga tempore placeat ut? Nobis id perferendis delectus ex modi, porro tenetur facilis debitis. At culpa temporibus
                exercitationem non ad deleniti consectetur?
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      <footer className="launcherFooter">
        <div className="footerInner">
          <div className="footerGrid">
            <div className="footerBlock">
              <h4>Visual Story-Writing</h4>
              <p>A research-oriented visual writing environment exploring the interaction between narrative text and structured visual representations.</p>
            </div>

            <div className="footerBlock">
              <h4>License</h4>
              <p className="footerMono">
                <strong className="accent">MIT License</strong>
                <br />
                <strong className="accent">Copyright © 2025 Damien Masson</strong>
              </p>
              <p>Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files to deal in the Software without restriction.</p>
            </div>

            <div className="footerBlock">
              <h4>Development</h4>
              <p>
                <strong className="accent"> Original project developer:</strong>
                <p>Damien Masson</p>
              </p>
              <br />
              <p>
                <strong className="accent">Co-development:</strong>
                <p>Andrei Bituleanu</p>
              </p>
            </div>
          </div>

          <div className="footerBottom">
            <span>MIT Licensed Software</span>
            <span>Provided without warranty of any kind</span>
          </div>
        </div>
      </footer>

      {showSetup && (
        <div className="setupOverlay" role="dialog" aria-modal="true">
          <div className="setupBackdrop" onClick={() => setShowSetup(false)} />
          <div className="setupPanel">
            <Card className="launchCard">
              <CardHeader className="launchHeader">
                <span className="launchIcon">
                  <MdHistoryEdu />
                </span>
                <div>
                  <div className="launchTitle">Get set up</div>
                  <div className="launchSubtitle">API key or Local AI</div>
                </div>
                <div className="setupActions">
                  <Button size="sm" variant="flat" onClick={() => setShowSetup(false)}>
                    Close
                  </Button>
                </div>
              </CardHeader>
              <Divider />
              <CardBody className="launchSection">
                <p>
                  To run the examples below, please paste an OpenAI API key. You can obtain one from <a href="https://platform.openai.com/account/api-keys">here</a>.
                </p>
                <Input
                  variant="faded"
                  label="API Key"
                  placeholder="sk-..."
                  onChange={(e) => {
                    setAccessKey(e.target.value);
                    setOpenAIKey(e.target.value);
                  }}
                ></Input>
              </CardBody>
              <Divider />
              <CardBody className="launchSection">
                <div className="box localBox">
                  <p>Test your Local AI to generate images</p>
                  <Button onClick={() => (window.location.hash = "/image-generation")}>Go To Testing Ground</Button>
                </div>
              </CardBody>

              <Divider />
              <CardBody className="launchSection">
                <span className="sectionTitle">Shortcuts to try out Visual Story-Writing on examples</span>
                <div className="buttonRow">
                  <Button
                    isDisabled={accessKey.length === 0}
                    onClick={() => {
                      startExample(textAlice, dataTextAlice);
                    }}
                  >
                    Alice in Wonderland
                  </Button>

                  <Button
                    isDisabled={accessKey.length === 0}
                    onClick={() => {
                      startExample(textB, dataTextB);
                    }}
                  >
                    Sled Adventure
                  </Button>

                  <Button
                    isDisabled={accessKey.length === 0}
                    onClick={() => {
                      startExample(textD, dataTextD);
                    }}
                  >
                    Waves Apart
                  </Button>

                  <Button
                    isDisabled={accessKey.length === 0}
                    onClick={() => {
                      startExample("", null);
                    }}
                  >
                    Blank Page
                  </Button>
                </div>
              </CardBody>
              <Divider />
              <CardBody className="launchSection">
                <span className="sectionTitle">Run study 1</span>
                <div className="formRow">
                  <Select isDisabled={accessKey.length === 0} variant="faded" label="Participant ID" className="max-w-xs" onChange={(e) => setPid(parseInt(e.target.value))}>
                    {Array.from({ length: 12 }, (_, i) => i).map((i) => (
                      <SelectItem key={i} value={i + 1} textValue={"P" + (i + 1)}>
                        P{i + 1}
                      </SelectItem>
                    ))}
                  </Select>
                  <Button
                    isDisabled={accessKey.length === 0 || pid === -1}
                    onClick={() => {
                      resetModel();
                      resetStudyModel();
                      window.location.hash = "/study" + "?pid=" + (pid + 1) + `&k=${btoa(accessKey)}` + "&studyType=READING";
                    }}
                  >
                    Start
                  </Button>
                </div>
              </CardBody>
              <Divider />
              <CardBody className="launchSection">
                <span className="sectionTitle">Run study 2</span>
                <div className="formRow">
                  <Select isDisabled={accessKey.length === 0} variant="faded" label="Participant ID" className="max-w-xs" onChange={(e) => setPid(parseInt(e.target.value))}>
                    {Array.from({ length: 12 }, (_, i) => i).map((i) => (
                      <SelectItem key={i} value={i + 1} textValue={"P" + (i + 1)}>
                        P{i + 1}
                      </SelectItem>
                    ))}
                  </Select>
                  <Button
                    isDisabled={accessKey.length === 0 || pid === -1}
                    onClick={() => {
                      resetModel();
                      resetStudyModel();
                      window.location.hash = "/study" + "?pid=" + (pid + 1) + `&k=${btoa(accessKey)}` + "&studyType=WRITING";
                    }}
                  >
                    Start
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
