import React from 'react';
import TextEditor from '../view/TextEditor';


export default function ReadingInterface(props: { children?: React.ReactNode }) {


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'rgb(242, 238, 240)' }}>
      <div style={{ display: 'flex', flexDirection: 'row', flexGrow: 1, height: '80%', alignItems: 'center', justifyContent: 'center' }}>
        {props.children}
        <TextEditor overlayOnHover={false} />
      </div>
    </div>
  )
}