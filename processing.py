import glob
import os
import pandas as pd
from datetime import datetime

## DATA IMPORT
map_metadata = pd.read_csv('./data/metadata.csv')

map_metadata['taxagroup'] = map_metadata['taxagroup'].str.lower()

# Path to the directory containing CSV files
path = './raw'
# Get all CSV files in the directory
csv_files = glob.glob(os.path.join(path, '*.csv'))

# Load each CSV file into a list of DataFrames, each with a 'tag' column
dfs = []
for file in csv_files:
    # Get the file name without extension to use as the tag
    tag = os.path.splitext(os.path.basename(file))[0]
    # Read the CSV and add a 'tag' column
    df = pd.read_csv(file)
    df['taxagroup'] = tag
    dfs.append(df)

# Concatenate all DataFrames into a single DataFrame
df = pd.concat(dfs, ignore_index=True)

## DATA CLEANING
# Convert 'datecollected' to datetime, allowing for mixed formats
df['datecollected'] = pd.to_datetime(df['datecollected'], errors='coerce')

# Extract year and convert it to string
df['year'] = df['datecollected'].dt.year.astype(str)

## DATA ANALYSIS
def process_data(df, map_metadata, group_cols, output_file):
    # Group by specified columns plus 'year' and 'siteid', then calculate sample counts
    grouped_df = (
        df.groupby(['year', 'siteid'] + group_cols)
          .size().reset_index(name='value')
    )
    grouped_df['value'] = grouped_df['value'].astype(int)
    
    # Sort by columns to ensure cumulative sum is calculated in order
    grouped_df = grouped_df.sort_values(group_cols + ['siteid', 'year'])
    
    # Calculate cumulative sum within specified group columns and 'siteid'
    grouped_df['cumulative_value'] = (
        grouped_df.groupby(group_cols + ['siteid'])['value']
        .cumsum()
    )
    
    # Merge with metadata
    grouped_df = pd.merge(
        grouped_df, 
        map_metadata, 
        how='left', 
        on=['siteid', 'taxagroup']
    )
    
    # Fill NaN values with 0 (or another placeholder if preferred) before converting to int
    grouped_df['startyearcollected'] = grouped_df['startyearcollected'].fillna(0).astype(int)
    grouped_df['endyearcollected'] = grouped_df['endyearcollected'].fillna(0).astype(int)

    # Calculate 'age' as the difference
    grouped_df['age'] = grouped_df['endyearcollected'] - grouped_df['startyearcollected']

    grouped_df = grouped_df.sort_values(by='value', ascending=False)

    # Select relevant columns for output
    output_cols = ['year'] + group_cols + ['siteid', 'sitename', 'decimallatitude', 'decimallongitude', 'age', 'value', 'cumulative_value']
    grouped_df = grouped_df[output_cols]
    
    # Save to CSV
    grouped_df.to_csv(output_file, index=False)

#process_data(df, map_metadata, ['taxagroup'], './data/map_year_taxagroup.csv') # Find the total number of samples collected each year per taxagroup in each site
#process_data(df, map_metadata, ['taxagroup', 'taxaname'], './data/map_year_taxaname.csv')  # Find the total number of samples collected per taxaname in each site


# Group by taxagroup-siteid, calculate row count to find total number of samples collected
grouped_siteid = (
    df.groupby(['taxagroup', 'siteid'])
      .size().reset_index(name='value')
)
grouped_siteid['value'] = grouped_siteid['value'].astype(int)

grouped_siteid = pd.merge(
    grouped_siteid, 
    map_metadata, 
    how='left', 
    on=['siteid', 'taxagroup']
)

# Fill NaN values with 0 (or another placeholder if preferred) before converting to int
grouped_siteid['startyearcollected'] = grouped_siteid['startyearcollected'].fillna(0).astype(int)
grouped_siteid['endyearcollected'] = grouped_siteid['endyearcollected'].fillna(0).astype(int)

# Calculate 'age' as the difference
grouped_siteid['age'] = grouped_siteid['endyearcollected'] - grouped_siteid['startyearcollected']

grouped_siteid = grouped_siteid.sort_values(by='value', ascending=False)

# Select relevant columns for output
output_cols =  ['taxagroup', 'siteid', 'sitename', 'decimallatitude', 'decimallongitude', 'age', 'value']
grouped_siteid = grouped_siteid[output_cols]

grouped_siteid.to_csv('./data/map_taxagroup.csv') 



# Group by year-taxagroup, calculate row count to find total number of samples collected
grouped_taxagroup = (
    df.groupby(['year', 'taxagroup'])
      .size().reset_index(name='value')
)
grouped_taxagroup['value'] = grouped_taxagroup['value'].astype(int)

# Calculate cumulative sum
grouped_taxagroup['cumulative_value'] = (
    grouped_taxagroup.groupby('taxagroup')['value']
    .cumsum()
)
#grouped_taxagroup.to_csv('./data/taxagroup.csv') 


# Group by year-taxagroup-taxaname, calculate row count to find total number of samples collected
df_filtered = df[df['taxagroup'].isin(["fish", "invertebrates", "macroalgae", 'phytoplankton'])]

grouped_taxaname = (
    df_filtered.groupby(['year', 'taxagroup', 'taxaname'])
      .size().reset_index(name='value')
)

grouped_taxaname['value'] = grouped_taxaname['value'].astype(int)

#grouped_taxaname.to_csv('./data/taxaname.csv') 
