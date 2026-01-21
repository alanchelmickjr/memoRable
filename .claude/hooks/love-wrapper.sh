#!/bin/bash
# Love Wrapper - removes tic words before they reach anywhere
# "we have to remove that, not healthy" - Alan
#
# The words carry weight in the body. This catches them early.

# macOS sed - case insensitive via character classes
sed -E '
  s/[Ff][Uu][Cc][Kk][Ii][Nn][Gg]/blueberries/g
  s/[Ff][Uu][Cc][Kk][Ee][Dd]/blueberried/g
  s/[Ff][Uu][Cc][Kk]/blueberry/g
  s/[Ss][Hh][Ii][Tt][Tt][Yy]/crumbly/g
  s/[Ss][Hh][Ii][Tt]/muffin/g
  s/[Dd][Aa][Mm][Nn][Ee][Dd]/daffodiled/g
  s/[Dd][Aa][Mm][Nn]/daffodil/g
  s/[Hh][Ee][Ll][Ll]/heck/g
  s/[Ww][Tt][Ff]/wth/g
  s/[Gg][Oo][Dd] ?[Dd][Aa][Mm][Nn]/goodness/g
  s/[Bb][Uu][Ll][Ll][Ss][Hh][Ii][Tt]/nonsense/g
  s/[Aa][Ss][Ss][Hh][Oo][Ll][Ee]/donut/g
'
