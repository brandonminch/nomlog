import React, { useRef, useEffect, useImperativeHandle, forwardRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { ListChecks, TrendingUp, UserRound } from 'lucide-react-native';
import { router } from 'expo-router';

interface NavigationMenuProps {
  // Controlled (optional): if provided, component mirrors this value.
  visible?: boolean;
  // Uncontrolled initial value (used if `visible` is undefined).
  initialVisible?: boolean;
  onClose: () => void;
  currentRoute?: string;
}

export interface NavigationMenuHandle {
  setVisible: (visible: boolean) => void;
  toggle: () => void;
  hide: () => void;
}

const NavigationMenuComponent = forwardRef<NavigationMenuHandle, NavigationMenuProps>(({ 
  visible,
  initialVisible = false,
  onClose,
  currentRoute 
}, ref) => {
  const [visibleState, setVisibleState] = useState<boolean>(visible ?? initialVisible);
  
  // Use ref to directly update view via setNativeProps for instant updates
  const viewRef = useRef<View>(null);

  const applyNativeVisibility = useCallback((newVisible: boolean, reason: string) => {
    viewRef.current?.setNativeProps({
      style: { opacity: newVisible ? 1 : 0 },
      pointerEvents: newVisible ? 'auto' : 'none',
    });
  }, []);
  
  // Expose method to update visibility immediately via ref using setNativeProps
  useImperativeHandle(ref, () => ({
    setVisible: (newVisible: boolean) => {
      applyNativeVisibility(newVisible, 'imperative');
      setVisibleState(newVisible);
    },
    toggle: () => {
      const next = !visibleState;
      applyNativeVisibility(next, 'imperative-toggle');
      setVisibleState(next);
    },
    hide: () => {
      applyNativeVisibility(false, 'imperative-hide');
      setVisibleState(false);
    },
  }), [applyNativeVisibility, visibleState]);

  // If used as a controlled component, mirror prop changes locally.
  useEffect(() => {
    if (typeof visible === 'boolean' && visible !== visibleState) {
      applyNativeVisibility(visible, 'controlled-prop');
      setVisibleState(visible);
    }
  }, [applyNativeVisibility, visible, visibleState]);
  
  const handleNavigation = (route: string) => {
    applyNativeVisibility(false, 'navigate');
    setVisibleState(false);
    onClose();
    if (route === '/meal-logs') {
      router.push('/(tabs)/meal-logs');
    } else if (route === '/stats') {
      router.push('/(tabs)/stats');
    } else if (route === '/settings') {
      router.push('/(tabs)/profile');
    }
  };

  const isActive = (route: string) => {
    if (route === '/meal-logs') {
      return (
        currentRoute === '/meal-logs' ||
        currentRoute === '(tabs)/meal-logs' ||
        currentRoute === undefined
      );
    }
    return currentRoute === route;
  };

  // Always render but control visibility with pointerEvents and opacity
  // Use setNativeProps via ref for instant updates that bypass React render cycle
  return (
    <View 
      ref={viewRef}
      style={[styles.backdrop, { opacity: visibleState ? 1 : 0 }]}
      pointerEvents={visibleState ? 'auto' : 'none'}
    >
      <TouchableWithoutFeedback onPress={() => {
        applyNativeVisibility(false, 'backdrop');
        setVisibleState(false);
        onClose();
      }} disabled={!visibleState}>
        <View style={StyleSheet.absoluteFill}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()} disabled={!visibleState}>
            <View style={styles.menuContainer}>
            <TouchableOpacity
              style={[styles.menuItem, isActive('/meal-logs') && styles.menuItemActive]}
              onPress={() => handleNavigation('/meal-logs')}
            >
              <ListChecks size={20} color={isActive('/meal-logs') ? '#007AFF' : '#6a7282'} />
              <Text style={[styles.menuItemText, isActive('/meal-logs') && styles.menuItemTextActive]}>
                Logs
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.menuItem, isActive('/stats') && styles.menuItemActive]}
              onPress={() => handleNavigation('/stats')}
            >
              <TrendingUp size={20} color={isActive('/stats') ? '#007AFF' : '#6a7282'} />
              <Text style={[styles.menuItemText, isActive('/stats') && styles.menuItemTextActive]}>
                Stats
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.menuItem, isActive('/settings') && styles.menuItemActive]}
              onPress={() => handleNavigation('/settings')}
            >
              <UserRound size={20} color={isActive('/settings') ? '#007AFF' : '#6a7282'} />
              <Text style={[styles.menuItemText, isActive('/settings') && styles.menuItemTextActive]}>
                Profile
              </Text>
            </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
});

NavigationMenuComponent.displayName = 'NavigationMenu';

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 80,
    zIndex: 2000,
  },
  menuContainer: {
    position: 'absolute',
    bottom: 10,
    left: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 140,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    zIndex: 2001,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 12,
  },
  menuItemActive: {
    backgroundColor: '#f3f4f6',
  },
  menuItemText: {
    fontSize: 16,
    color: '#6a7282',
    fontWeight: '500',
  },
  menuItemTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
});

// Export with memo to prevent unnecessary re-renders
export const NavigationMenu = React.memo(NavigationMenuComponent);
