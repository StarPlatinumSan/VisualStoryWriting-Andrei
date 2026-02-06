import { create } from 'zustand';



/** 
 * Model 
 **/
interface ViewModelState {
    hoveredLocation: string | null;
    textIsBeingEdited: boolean;
}

interface ViewModelAction {
    reset: () => void;
    setHoveredLocation: (location: string | null) => void;
    setTextIsBeingEdited: (isBeingEdited: boolean) => void;
}

const initialState: ViewModelState = {
    hoveredLocation: null,
    textIsBeingEdited: false
}


export const useViewModelStore = create<ViewModelState & ViewModelAction>()((set, get) => ({
    ...initialState,
    reset: () => set((state) => ({ ...initialState })),
    setHoveredLocation: (location) => set((state) => ({ hoveredLocation: location })),
    setTextIsBeingEdited: (isBeingEdited) => set((state) => ({ textIsBeingEdited: isBeingEdited })),
}))


//         
