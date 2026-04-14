import { Button, Tab, Tabs, Tooltip } from '@nextui-org/react';
import { ReactFlowProvider, useKeyPress } from '@xyflow/react';
import React, { useEffect, useState } from 'react';
import { FaTrashAlt } from 'react-icons/fa';
import { FaLocationDot } from 'react-icons/fa6';
import { IoPersonCircle } from 'react-icons/io5';
import { MdImage } from 'react-icons/md';
import { TbArrowBigLeftLinesFilled, TbArrowBigRightLinesFilled } from 'react-icons/tb';
import { useHistoryModelStore } from '../model/HistoryModel';
import { LayoutUtils } from '../model/LayoutUtils';
import { useModelStore } from '../model/Model';
import { RewriteFromImageTraits } from '../model/prompts/textEditors/RewriteFromImageTraits';
import { RewriteFromVisual } from '../model/prompts/textEditors/RewriteFromVisual';
import { ExtractedImageEntity } from '../model/prompts/textExtractors/ImageEntitiesExtractor';
import { EntitiesExtractor } from '../model/prompts/textExtractors/EntitiesExtractor';
import { LocationExtractor } from '../model/prompts/textExtractors/LocationsExtractor';
import { VisualRefresher } from '../model/prompts/textExtractors/VisualRefresher';
import { useStudyStore } from '../study/StudyModel';
import HistoryTree from './HistoryTree';
import TextEditor from './TextEditor';
import ActionTimeline from './actionTimeline/ActionTimeline';
import EntitiesEditor from './entityActionView/EntitiesEditor';
import ImagesEditor from './imageView/ImagesEditor';
import LocationsEditor from './locationView/LocationsEditor';

export default function VisualWritingInterface(props: { children?: React.ReactNode }) {
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedTab, setSelectedTab] = useState('entities');
  const [imagesRefreshToken, setImagesRefreshToken] = useState(0);
  const [imagesClearToken, setImagesClearToken] = useState(0);
  const [imageEntitiesForRewrite, setImageEntitiesForRewrite] = useState<ExtractedImageEntity[]>([]);
  const [showTimeline, setShowTimeline] = useState(true);
  const visualTopInset = 56;
  const isStale = useModelStore(state => state.isStale);
  const isReadOnly = useModelStore(state => state.isReadOnly);
  const escapePressed = useKeyPress(["Escape"]);

  const visualPanelRef = React.createRef<HTMLDivElement>();
  const isFreeFormMode = !props.children;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // undo/redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          useHistoryModelStore.getState().redo();
        } else {
          useHistoryModelStore.getState().undo();
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
    }
  }, []);

  useEffect(() => {
    if (escapePressed) {
      // Unselect everything that can be selected
      useModelStore.getState().setSelectedNodes([]);
      useModelStore.getState().setSelectedEdges([]);
      useModelStore.getState().setFilteredActionsSegment(null, null);
    }
  }, [escapePressed]);

  useEffect(() => {
    const center = { x: visualPanelRef.current!.clientWidth / 2, y: visualPanelRef.current!.clientHeight / 2 + visualTopInset / 2 };

    LayoutUtils.optimizeNodeLayout("entity", useModelStore.getState().entityNodes, useModelStore.getState().setEntityNodes, center, 120, 100);
    LayoutUtils.optimizeNodeLayout("location", useModelStore.getState().locationNodes, useModelStore.getState().setLocationNodes, center, 120);
  }, [selectedTab, visualTopInset]);

  useEffect(() => {
    const center = { x: visualPanelRef.current!.clientWidth / 2, y: visualPanelRef.current!.clientHeight / 2 + visualTopInset / 2 };

    VisualRefresher.getInstance().onUpdate = () => {
      LayoutUtils.optimizeNodeLayout("locations", useModelStore.getState().locationNodes, useModelStore.getState().setLocationNodes, { x: center.x, y: center.y }, 120);
      LayoutUtils.optimizeNodeLayout("entity", useModelStore.getState().entityNodes, useModelStore.getState().setEntityNodes, { x: center.x, y: center.y }, 120, 100);
    };

    VisualRefresher.getInstance().onRefreshDone = () => {
      if (useModelStore.getState().isStale) {
        useModelStore.getState().setIsStale(false);
      }
    };
  }, [visualTopInset]);

  const setSelectedTabLogged = (tab: string) => {
    useStudyStore.getState().logEvent("TAB_CHANGE", { tab });
    setSelectedTab(tab);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {isFreeFormMode && !isReadOnly && (
        <div style={{ background: "#f8fafc", borderBottom: "1px solid #e5e7eb", padding: "8px 16px", fontSize: 13, color: "#374151" }}>
          <>
            <strong>How to start:</strong> write or paste your story on the left, then choose a section and click <strong>Refresh from text</strong> (<TbArrowBigRightLinesFilled style={{ display: "inline", transform: "translateY(2px)" }} />).  
            It will load only that section (Entities, Locations, or Images).
          </>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'row', flexGrow: 1, height: '80%' }}>
        {props.children}
        <TextEditor />
        <div className='flex flex-col' style={{ position: 'relative' }}>
          <div style={{ width: '50vw', height: '100%', background: '#F3F4F6', borderLeft: '1px solid #DDDDDF', borderBottom: '1px solid #DDDDDF' }} ref={visualPanelRef}>
            <div style={{ paddingTop: visualTopInset, height: "100%", boxSizing: "border-box" }}>
              {selectedTab === "entities" && <ReactFlowProvider><EntitiesEditor /></ReactFlowProvider>}
              {selectedTab === "locations" && <ReactFlowProvider><LocationsEditor /></ReactFlowProvider>}
              <div style={{ display: selectedTab === "images" ? "block" : "none", height: "100%" }}>
                <ImagesEditor
                  refreshToken={imagesRefreshToken}
                  clearToken={imagesClearToken}
                  onRefreshDone={() => setIsExtracting(false)}
                  onEntitiesChange={setImageEntitiesForRewrite}
                />
              </div>
            </div>
            <Tabs keyboardActivation='manual' onSelectionChange={setSelectedTabLogged as any} selectedKey={selectedTab} color='primary' variant='bordered' style={{ position: 'absolute', left: '50%', top: 10, transform: 'translate(-50%, 0)' }} classNames={{ tabList: 'bg-white', }}>
              <Tab key={"entities"} title={<span style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', fontSize: 15 }}><IoPersonCircle style={{ marginRight: 3, fontSize: 22 }} /> Entities & Actions</span>} />
              <Tab key={'locations'} title={<span style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', fontSize: 15 }}><FaLocationDot style={{ marginRight: 3, fontSize: 18 }} /> Locations</span>} />
              <Tab key={'images'} title={<span style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', fontSize: 15 }}><MdImage style={{ marginRight: 3, fontSize: 18 }} /> Images</span>} />
            </Tabs>

            <div style={{ position: 'absolute', right: 10, top: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button size="sm" variant="flat" onClick={() => setShowTimeline((prev) => !prev)}>
                {showTimeline ? "Hide timeline" : "Show timeline"}
              </Button>
              {!isReadOnly && (
                <Button style={{ fontSize: 18 }} isIconOnly onClick={(e) => {
                  const confirmed = window.confirm("Clear all extracted data and image cards? This will remove entities, locations, actions, and images.");
                  if (!confirmed) return;
                  console.log(useModelStore.getState().entityNodes);
                  // Cancel exisitng animations because otherwise they might revive the deleted nodes
                  LayoutUtils.stopAllSimulations();
                  useModelStore.getState().setActionEdges([]);
                  useModelStore.getState().setLocationNodes([]);
                  useModelStore.getState().setEntityNodes([]);
                  useModelStore.getState().setFilteredActionsSegment(null, null);
                  useModelStore.getState().setHighlightedActionsSegment(null, null);
                  VisualRefresher.getInstance().reset();
                  setImageEntitiesForRewrite([]);
                  setImagesClearToken((v) => v + 1);
                }}><FaTrashAlt /></Button>
              )}
            </div>
          </div>
          {showTimeline && <ReactFlowProvider><ActionTimeline /></ReactFlowProvider>}
          {!isReadOnly && <div style={{ display: 'flex', flexDirection: 'column', gap: 5, position: 'absolute', left: 0, top: '50%', transform: 'translate(-50%, -50%)', fontSize: 22 }}>
            <Tooltip content={selectedTab === "images" ? "Refresh image entities from text" : "Refresh from text"} closeDelay={0}>
              <Button style={{ fontSize: 22 }} color={isStale ? "primary": "default"} isLoading={isExtracting} isIconOnly radius={'full'}
                onClick={() => {
                  if (selectedTab === "images") {
                    setIsExtracting(true);
                    setImagesRefreshToken((v) => v + 1);
                    return;
                  }

                  const center = { x: visualPanelRef.current!.clientWidth / 2, y: visualPanelRef.current!.clientHeight / 2 };
                  setIsExtracting(true);
                  const state = useModelStore.getState();
                  const extractorPromise =
                    selectedTab === "entities"
                      ? EntitiesExtractor(state.text, center)
                      : LocationExtractor(state.text, center);

                  extractorPromise
                    .then(() => setIsExtracting(false))
                    .catch((error) => {
                      console.error("Failed to extract from selected section:", error);
                      setIsExtracting(false);
                    });
                }}
              >
                <TbArrowBigRightLinesFilled />
              </Button>
            </Tooltip>
            <Tooltip placement='bottom' content="Write from visual" closeDelay={0}>
              <Button style={{ fontSize: 22 }} isLoading={isExtracting} isIconOnly radius={'full'}
                isDisabled={selectedTab === "images" ? imageEntitiesForRewrite.length === 0 : false}
                onClick={() => {
                  if (selectedTab === "images") {
                    if (imageEntitiesForRewrite.length === 0) return;
                    new RewriteFromImageTraits(imageEntitiesForRewrite).execute();
                    return;
                  }

                  new RewriteFromVisual().execute();
                }}
              >
                <TbArrowBigLeftLinesFilled />
              </Button>
            </Tooltip>
          </div>}
        </div> 
      </div>
      {!isReadOnly && <HistoryTree />}

    </div>
  )
}
