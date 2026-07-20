# [stash-box](https://github.com/stashapp/stash-box) rescrape

This userscript helps you verify submitted scenes and performers in the edit queue by scraping
their links through your own Stash instance (or Stash-CI if you have a token for that)

It also allows rescraping from the edit pages on stash-box, showing results and offering a
convenient list of additions and corrections similar to how the [stash-box backlog userscript](https://github.com/peolic/stashdb-backlog-userscript) works

## [**INSTALL USERSCRIPT**](https://github.com/Maista6969/stash-box-rescrape/releases/latest/download/stash-box-rescrape.user.js)

Installation requires a browser extension such as [Violentmonkey] / [Tampermonkey] / [Greasemonkey].

### Screenshots

<table>
<tr>
<td align="center" width="50%">
<a href="images/rescrape-scene.png" target="_blank"><img src="https://raw.githubusercontent.com/Maista6969/stash-box-rescrape/refs/heads/main/images/rescrape-scene.png" width="400" alt="Scene overlay comparison"></a><br>
<sub>Full comparison overlay on edit page</sub>
</td>
<td align="center" width="50%">
<a href="images/rescrape-scene-editcard.png" target="_blank"><img src="https://raw.githubusercontent.com/Maista6969/stash-box-rescrape/refs/heads/main/images/rescrape-scene-editcard.png" width="400" alt="Rescrape diff panel"></a><br>
<sub>Rescrape directly on edit cards to make review faster</sub>
</td>
</tr>
<tr>
<td align="center" width="50%">
<a href="images/rescrape-edit-form-links.png" target="_blank"><img src="https://raw.githubusercontent.com/Maista6969/stash-box-rescrape/refs/heads/main/images/rescrape-edit-form-links.png" width="400" alt="Edit form links tab"></a><br>
<sub>Rescrape individual links straight from the edit form</sub>
</td>
<td align="center" width="50%">
<a href="images/rescrape-config.png" target="_blank"><img src="https://raw.githubusercontent.com/Maista6969/stash-box-rescrape/refs/heads/main/images/rescrape-config.png" width="400" alt="Configuration dialog"></a><br>
<sub>Configure your local Stash API endpoints or use [Scrape-CI]</sub>
</td>
</tr>
</table>

[Violentmonkey]: https://violentmonkey.github.io/
[Tampermonkey]: https://www.tampermonkey.net/
[Greasemonkey]: https://www.greasespot.net/
[Scrape-CI]: https://github.com/feederbox826/stash-scrape-ci-standalone/
