import { Button, Card, CardBody, CardHeader, Divider, Input, Select, SelectItem } from "@nextui-org/react";
import { useState } from "react";
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

  return (
    <div className={`launcher ${isDark ? "launcherDark" : ""}`}>
      <Card className="launchCard">
        <CardHeader className="launchHeader">
          <span className="launchIcon">
            <MdHistoryEdu />
          </span>
          <span className="launchTitle">Visual Story-Writing</span>
          <div className="headerActions">
            <Button size="sm" variant="flat" className="themeSwitch" onClick={toggleTheme}>
              <span className="themeIcon">{isDark ? <MdLightMode /> : <MdDarkMode />}</span>
              <span className="themeLabel">{isDark ? "Light" : "Dark"}</span>
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
            <Button>Go To Testing Ground</Button>
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
  );
}
