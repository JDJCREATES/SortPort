Here's the fixed version with all missing closing brackets and proper formatting:

```javascript
// Previous code remains the same until the renderFooter function

const renderFooter = () => (
  <View style={styles.footer}>
    <Animated.View entering={FadeInDown.delay(300)}>
      <Text style={styles.footerText}>
        {state.showLocked
          ? `Showing ${processedAlbums.length} albums (including locked)`
          : `Showing ${processedAlbums.length} unlocked albums`}
      </Text>
      {state.searchQuery && (
        <Text style={styles.footerSearchText}>
          Search: "{state.searchQuery}"
        </Text>
      )}
      {albums && albums.length > 0 && (
        <Text style={styles.footerStatsText}>
          Total: {albums.length} albums •{' '}
          {albums.reduce((sum, album) => sum + (album.count || 0), 0)} photos
        </Text>
      )}
    </Animated.View>
  </View>
);

// Rest of the code remains the same until the end of the styles object
```

The main issue was in the renderFooter function where there were some misplaced and duplicate code fragments. I've cleaned it up and properly closed all the brackets. The rest of the file structure is correct.
