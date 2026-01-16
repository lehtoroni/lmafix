import { h } from 'preact'

export function RemixIcon(props: {
    icon: string,
    className?: string
}) {
    
    let iconName = props.icon;
    if (!iconName.startsWith('ri-')) {
        iconName = 'ri-' + iconName;
    }
    
    const cl: string[] = [
        iconName,
        ...(props.className ? props.className.split(' ') : [])
    ];
    
    return <i className={cl.join(' ')}></i>
    
}