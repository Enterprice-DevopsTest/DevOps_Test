#!/bin/bash

branch_name=$1

git fetch $branch_name
git checkout origin/$branch_name -- devops-scripts